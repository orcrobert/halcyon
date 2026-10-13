from datetime import timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import Session, select

from api.app.db import get_session
from api.app.models.tables import AuthToken, User, utcnow
from api.app.security import hash_token

SessionDep = Annotated[Session, Depends(get_session)]

TOKEN_TOUCH_INTERVAL = timedelta(seconds=60)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _UNAUTHENTICATED
    return authorization.split(" ", 1)[1].strip()


def current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    token = session.exec(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(_bearer_token(authorization))
        )
    ).first()

    if token is None:
        raise _UNAUTHENTICATED

    now = utcnow()
    last_used = token.last_used_at
    if last_used is not None and last_used.tzinfo is None:
        last_used = last_used.replace(tzinfo=timezone.utc)
    if last_used is None or now - last_used >= TOKEN_TOUCH_INTERVAL:
        token.last_used_at = now
        session.add(token)
        session.commit()

    return token.user


CurrentUser = Annotated[User, Depends(current_user)]


def current_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can do that.",
        )
    return user


CurrentAdmin = Annotated[User, Depends(current_admin)]


def managed_user(user_id: int, session: SessionDep, _admin: CurrentAdmin) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


ManagedUser = Annotated[User, Depends(managed_user)]


def account_owner(request: Request, session: SessionDep, viewer: CurrentUser) -> User:
    target = str(request.path_params.get("user_id", ""))
    if not target:
        return viewer
    return managed_user(
        int(target) if target.isdigit() else 0, session, current_admin(viewer)
    )


AccountOwner = Annotated[User, Depends(account_owner)]
