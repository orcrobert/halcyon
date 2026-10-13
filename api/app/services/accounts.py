import logging

from sqlmodel import Session, select

from api.app.config import settings
from api.app.db import session_scope
from api.app.models.tables import Atmosphere, AuthToken, User
from api.app.security import hash_password
from api.app.services import storage

logger = logging.getLogger(__name__)

ADMIN_NAME = "Admin"


def find_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.strip().lower())).first()


def email_in_use(session: Session, email: str, exclude: int | None = None) -> bool:
    owner = find_by_email(session, email)
    return owner is not None and owner.id != exclude


def create_user(
    session: Session, name: str, email: str, password: str, is_admin: bool = False
) -> User:
    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        password_hash=hash_password(password),
        is_admin=is_admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def revoke_sessions(session: Session, user: User) -> None:
    for token in session.exec(select(AuthToken).where(AuthToken.user_id == user.id)).all():
        session.delete(token)


def delete_user(session: Session, user: User) -> None:
    atmosphere_ids = session.exec(
        select(Atmosphere.id).where(Atmosphere.user_id == user.id)
    ).all()
    session.delete(user)
    session.commit()

    for atmosphere_id in atmosphere_ids:
        storage.delete_atmosphere_audio(atmosphere_id)
        storage.delete_style(atmosphere_id)


def ensure_admin() -> str | None:
    email = (settings.admin_email or "").strip().lower()
    if not email:
        return None

    with session_scope() as session:
        user = find_by_email(session, email)
        if user is None:
            if not settings.admin_password:
                logger.warning(
                    "ADMIN_EMAIL=%s has no account and ADMIN_PASSWORD is empty, "
                    "so no admin was created.",
                    email,
                )
                return None
            create_user(session, ADMIN_NAME, email, settings.admin_password, is_admin=True)
            return "created"

        if user.is_admin:
            return None
        user.is_admin = True
        session.add(user)
        session.commit()
        return "promoted"
