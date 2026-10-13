from fastapi import APIRouter, Header, HTTPException, Response, status
from sqlmodel import select
from typing import Annotated

from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    AuthOptionsOut,
    AuthResponse,
    Envelope,
    LoginRequest,
    RegisterRequest,
    UserOut,
)
from api.app.models.tables import AuthToken, User
from api.app.security import hash_token, issue_token, verify_password
from api.app.services.accounts import (
    create_user,
    email_in_use,
    find_by_email,
    has_admin,
    registration_open,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _authenticate(session: SessionDep, user: User) -> AuthResponse:
    token, token_hash = issue_token()
    session.add(AuthToken(user_id=user.id, token_hash=token_hash))
    session.commit()
    return AuthResponse(data=UserOut.model_validate(user, from_attributes=True), token=token)


@router.get("/options")
def options(session: SessionDep) -> Envelope[AuthOptionsOut]:
    return Envelope(data=AuthOptionsOut(registration=registration_open(session)))


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: SessionDep) -> AuthResponse:
    if not registration_open(session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled on this instance.",
        )

    if email_in_use(session, payload.email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email address is already registered.",
        )

    user = create_user(
        session,
        payload.name,
        payload.email,
        payload.password,
        is_admin=not has_admin(session),
    )

    return _authenticate(session, user)


@router.post("/login")
def login(payload: LoginRequest, session: SessionDep) -> AuthResponse:
    user = find_by_email(session, payload.email)

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Those credentials do not match our records.",
        )

    return _authenticate(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    session: SessionDep,
    _user: CurrentUser,
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    token_hash = hash_token(authorization.split(" ", 1)[1].strip())
    token = session.exec(
        select(AuthToken).where(AuthToken.token_hash == token_hash)
    ).first()

    if token is not None:
        session.delete(token)
        session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(user: CurrentUser) -> Envelope[UserOut]:
    return Envelope(data=UserOut.model_validate(user, from_attributes=True))
