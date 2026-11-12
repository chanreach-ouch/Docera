import hashlib
import hmac
import secrets
from pathlib import Path

from fastapi import Request

from app.core.errors import AppError

COOKIE_NAME = "docera_session"


class Sessions:
    def __init__(self, root: Path):
        key_file = root / "session.key"
        try:
            with key_file.open("xb") as handle:
                handle.write(secrets.token_bytes(32))
            key_file.chmod(0o600)
        except FileExistsError:
            pass
        self.key = key_file.read_bytes()
        if len(self.key) != 32:
            raise RuntimeError("Invalid private session key")

    def issue(self) -> str:
        owner = secrets.token_hex(32)
        return owner + "." + self._sign(owner)

    def _sign(self, owner: str) -> str:
        return hmac.new(self.key, owner.encode(), hashlib.sha256).hexdigest()

    def owner(self, token: str | None) -> str | None:
        if not token or len(token) != 129:
            return None
        owner, _, signature = token.partition(".")
        if len(owner) != 64 or any(c not in "0123456789abcdef" for c in owner):
            return None
        return owner if hmac.compare_digest(signature, self._sign(owner)) else None


def require_owner(request: Request) -> str:
    owner = request.app.state.sessions.owner(request.cookies.get(COOKIE_NAME))
    if not owner:
        raise AppError("session_required", "Start a document session, then try again.", 401)
    return owner
