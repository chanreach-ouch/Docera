import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes import router
from app.api.tools_routes import tools_router
from app.core.config import Settings
from app.core.errors import AppError
from app.core.middleware import BoundaryMiddleware
from app.core.session import Sessions
from app.repositories.files import FileRepository
from app.schemas import ErrorResponse
from app.services.files import FileService
from app.services.storage.local import LocalStorage

logger = logging.getLogger("docera")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        root = settings.data_dir.resolve()
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        app.state.settings = settings
        app.state.sessions = Sessions(root)
        app.state.storage = LocalStorage(root / "blobs")
        app.state.repository = FileRepository(root / "metadata.sqlite3")
        app.state.files = FileService(settings, app.state.repository, app.state.storage)
        await run_in_threadpool(app.state.files.recover)

        async def janitor():
            while True:
                await asyncio.sleep(settings.cleanup_interval_seconds)
                try:
                    await run_in_threadpool(app.state.files.cleanup)
                except Exception:
                    logger.error('{"event":"cleanup_failed"}')

        task = asyncio.create_task(janitor())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Docera API", version="0.1.0", lifespan=lifespan, responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})

    def error_response(request: Request, code: str, message: str, status: int):
        return JSONResponse({"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", "unavailable")}}, status_code=status)

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return error_response(request, exc.code, exc.message, exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return error_response(request, "invalid_request", "Check the file and request values, then try again.", 422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(request, "invalid_request", "The request could not be completed.", exc.status_code)

    @app.exception_handler(Exception)
    async def unknown_error(request: Request, exc: Exception):
        logger.error('{"event":"internal_error","request_id":"%s"}', getattr(request.state, "request_id", "unavailable"))
        return error_response(request, "internal_error", "Docera could not complete this request. Please try again.", 500)

    app.include_router(router)
    app.include_router(tools_router)
    app.add_middleware(BoundaryMiddleware, settings=settings)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    return app


app = create_app()
