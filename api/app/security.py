import base64
import hashlib
import secrets

from cryptography.fernet import Fernet, InvalidToken
from pwdlib import PasswordHash

from api.app.config import settings

_password_hash = PasswordHash.recommended()
_fernet: Fernet | None = None


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def issue_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _secret_material() -> str:
    if settings.secret_key:
        return settings.secret_key

    key_file = settings.data_path / "secret.key"
    if not key_file.exists():
        settings.data_path.mkdir(parents=True, exist_ok=True)
        key_file.write_text(secrets.token_urlsafe(48))
        key_file.chmod(0o600)
    return key_file.read_text().strip()


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        digest = hashlib.sha256(_secret_material().encode()).digest()
        _fernet = Fernet(base64.urlsafe_b64encode(digest))
    return _fernet


def encrypt_secret(value: str) -> str:
    return _cipher().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _cipher().decrypt(value.encode()).decode()
    except InvalidToken:
        return None
