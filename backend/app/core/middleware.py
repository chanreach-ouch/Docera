import asyncio
import json
import logging
import tempfile
import time
from uuid import uuid4

from starlette.datastructures import Headers

from app.core.config import Settings

logger = logging.getLogger("docera")


class BoundaryMiddleware:
    """Bound incoming bytes before multipart parsing, even without Content-Length."""

    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings
        self.active_uploads = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        headers = Headers(scope=scope)
        method = scope["method"]
        started = time.monotonic()
        status = 500

        async def guarded_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", request_id.encode()), (b"x-content-type-options", b"nosniff"), (b"cache-control", b"no-store"), (b"referrer-policy", b"no-referrer")]
            await send(message)

        async def error(code, message, http_status):
            body = json.dumps({"error": {"code": code, "message": message, "request_id": request_id}}).encode()
            await guarded_send({"type": "http.response.start", "status": http_status, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await guarded_send({"type": "http.response.body", "body": body})

        try:
            if method in {"POST", "PUT", "PATCH", "DELETE"}:
                origin = headers.get("origin")
                if (origin and origin not in self.settings.allowed_origins) or headers.get("sec-fetch-site") == "cross-site":
                    return await error("origin_denied", "Use Docera from its configured local address.", 403)
            upload = method == "POST" and (
                scope["path"] == "/api/v1/files/upload"
                or scope["path"].startswith("/api/v1/tools/")
            )
            if not upload:
                return await self.app(scope, receive, guarded_send)
            if self.active_uploads >= 4:
                return await error("upload_busy", "Too many document operations are running. Please try again shortly.", 429)
            multiplier = 4 if scope["path"].startswith("/api/v1/tools/") else 1
            limit = self.settings.max_upload_bytes * multiplier + 128 * 1024
            try:
                length = int(headers.get("content-length", "0"))
            except ValueError:
                return await error("invalid_request", "Invalid upload length.", 400)
            if length < 0 or length > limit:
                return await error("file_too_large", "This upload exceeds the size limit.", 413)
            self.active_uploads += 1
            try:
                with tempfile.SpooledTemporaryFile(max_size=512 * 1024, mode="w+b") as spool:
                    size = 0
                    try:
                        async with asyncio.timeout(60):
                            while True:
                                message = await receive()
                                if message["type"] == "http.disconnect":
                                    return
                                chunk = message.get("body", b"")
                                size += len(chunk)
                                if size > limit:
                                    return await error("file_too_large", "This upload exceeds the size limit.", 413)
                                spool.write(chunk)
                                if not message.get("more_body", False):
                                    break
                    except TimeoutError:
                        return await error("upload_timeout", "The upload timed out. Please try again.", 408)
                    spool.seek(0)
                    remaining = size

                    async def replay():
                        nonlocal remaining
                        if remaining:
                            body = spool.read(64 * 1024)
                            remaining -= len(body)
                            return {"type": "http.request", "body": body, "more_body": remaining > 0}
                        return await receive()

                    await self.app(scope, replay, guarded_send)
            finally:
                self.active_uploads -= 1
        finally:
            # No cookies, filenames, query strings, file IDs or document contents.
            logger.info(json.dumps({"event": "request", "request_id": request_id, "method": method, "status": status, "duration_ms": round((time.monotonic() - started) * 1000)}))
