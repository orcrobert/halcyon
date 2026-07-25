from fastapi import APIRouter, Header, HTTPException, Response, status
from sqlmodel import select
from typing import Annotated

from ai.app.config import settings
from ai.app.deps import CurrentUser, SessionDep
from ai.app.models.schemas import (
    AuthResponse,
    Envelope,
    LoginRequest,
    RegisterRequest,
    UserOut,
)
from ai.app.models.tables import AuthToken, User
from ai.app.security import hash_password, hash_token, issue_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _authenticate(session: SessionDep, user: User) -> AuthResponse:
    token, token_hash = issue_token()
    session.add(AuthToken(user_id=user.id, token_hash=token_hash))
    session.commit()
    return AuthResponse(data=UserOut.model_validate(user, from_attributes=True), token=token)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: SessionDep) -> AuthResponse:
    if not settings.allow_registration:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled on this instance.",
        )

    email = payload.email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email address is already registered.",
        )

    user = User(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return _authenticate(session, user)


@router.post("/login")
def login(payload: LoginRequest, session: SessionDep) -> AuthResponse:
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()

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
