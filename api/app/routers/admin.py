from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import select

from api.app.deps import CurrentAdmin, ManagedUser, SessionDep
from api.app.models.schemas import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    Envelope,
)
from api.app.models.tables import Atmosphere, AuthToken, GeneratorProfile, User, utcnow
from api.app.security import hash_password
from api.app.services.accounts import (
    create_user,
    delete_user,
    email_in_use,
    revoke_sessions,
)

USER_PREFIX = "/api/admin/users/{user_id}"

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


def _counts(session: SessionDep, column, group) -> dict[int, int]:
    rows = session.exec(select(group, func.count(column)).group_by(group)).all()
    return {owner: count for owner, count in rows}


def _serialize_all(session: SessionDep, users: list[User]) -> list[AdminUserOut]:
    atmospheres = _counts(session, Atmosphere.id, Atmosphere.user_id)
    generators = _counts(session, GeneratorProfile.id, GeneratorProfile.user_id)
    last_active = dict(
        session.exec(
            select(AuthToken.user_id, func.max(AuthToken.last_used_at)).group_by(
                AuthToken.user_id
            )
        ).all()
    )
    return [
        AdminUserOut.model_validate(
            {
                **user.model_dump(exclude={"password_hash"}),
                "atmospheres": atmospheres.get(user.id, 0),
                "generators": generators.get(user.id, 0),
                "last_active_at": last_active.get(user.id),
            }
        )
        for user in users
    ]


def _serialize(session: SessionDep, user: User) -> AdminUserOut:
    return _serialize_all(session, [user])[0]


def _reject_taken_email(session: SessionDep, email: str, exclude: int | None = None) -> None:
    if email_in_use(session, email, exclude=exclude):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email address is already registered.",
        )


def _reject_self(admin: User, user: User, detail: str) -> None:
    if admin.id == user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.get("")
def index(_admin: CurrentAdmin, session: SessionDep) -> Envelope[list[AdminUserOut]]:
    users = session.exec(select(User).order_by(User.created_at)).all()
    return Envelope(data=_serialize_all(session, list(users)))


@router.post("", status_code=status.HTTP_201_CREATED)
def store(
    payload: AdminUserCreate, _admin: CurrentAdmin, session: SessionDep
) -> Envelope[AdminUserOut]:
    _reject_taken_email(session, payload.email)
    user = create_user(
        session, payload.name, payload.email, payload.password, is_admin=payload.is_admin
    )
    return Envelope(data=_serialize(session, user))


@router.get("/{user_id}")
def show(user: ManagedUser, session: SessionDep) -> Envelope[AdminUserOut]:
    return Envelope(data=_serialize(session, user))


@router.patch("/{user_id}")
def update(
    payload: AdminUserUpdate,
    user: ManagedUser,
    admin: CurrentAdmin,
    session: SessionDep,
) -> Envelope[AdminUserOut]:
    provided = payload.model_dump(exclude_unset=True)

    if provided.get("name"):
        user.name = provided["name"].strip()

    if provided.get("email"):
        _reject_taken_email(session, provided["email"], exclude=user.id)
        user.email = provided["email"]

    if provided.get("is_admin") is False:
        _reject_self(admin, user, "You cannot remove your own admin access.")
    if provided.get("is_admin") is not None:
        user.is_admin = provided["is_admin"]

    if provided.get("password"):
        user.password_hash = hash_password(provided["password"])
        if user.id != admin.id:
            revoke_sessions(session, user)

    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    return Envelope(data=_serialize(session, user))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(user: ManagedUser, admin: CurrentAdmin, session: SessionDep) -> Response:
    _reject_self(admin, user, "You cannot delete your own account here.")
    delete_user(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
