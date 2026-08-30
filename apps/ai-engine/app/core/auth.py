import os
import secrets

from fastapi import Header, HTTPException, status


def require_internal_secret(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> None:
    expected = os.environ.get("AI_ENGINE_SECRET", "")
    if not expected or not x_internal_secret or not secrets.compare_digest(
        x_internal_secret, expected
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_UNAUTHORIZED", "message": "Internal secret required"},
        )
