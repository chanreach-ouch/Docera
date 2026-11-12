from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse

from pydantic import BaseModel

from app.core.session import COOKIE_NAME, require_owner
from app.schemas import FileDetail, FileList, HealthInfo, SessionInfo


class RenameRequest(BaseModel):
    filename: str

router = APIRouter(prefix="/api/v1")
Owner = Annotated[str, Depends(require_owner)]


@router.get("/health", response_model=HealthInfo)
def health():
    return HealthInfo()


@router.post("/session", response_model=SessionInfo)
def session(request: Request, response: Response):
    settings = request.app.state.settings
    sessions = request.app.state.sessions
    token = request.cookies.get(COOKIE_NAME)
    if not sessions.owner(token):
        token = sessions.issue()
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=settings.secure_cookie, samesite="strict", max_age=settings.retention_seconds, path="/api/v1")
    return SessionInfo(**settings.model_dump())


@router.post("/files/upload", response_model=FileDetail, status_code=201)
def upload(request: Request, owner: Owner, file: Annotated[UploadFile, File()]):
    try:
        return request.app.state.files.upload(file.file, file.filename, owner)
    finally:
        file.file.close()


@router.get("/files", response_model=FileList)
def list_files(request: Request, owner: Owner):
    return {"files": request.app.state.files.list_for_owner(owner)}


@router.get("/files/{file_id}", response_model=FileDetail)
def get_file(file_id: UUID, request: Request, owner: Owner):
    return request.app.state.files.get(str(file_id), owner)


@router.get("/files/{file_id}/download")
def download(file_id: UUID, request: Request, owner: Owner):
    document = request.app.state.files.get(str(file_id), owner)
    return FileResponse(request.app.state.storage.source(str(file_id)), media_type="application/pdf", filename=document["filename"], content_disposition_type="attachment", headers={"Content-Security-Policy": "sandbox; default-src 'none'"})


@router.patch("/files/{file_id}", response_model=FileDetail)
def rename_file(file_id: UUID, body: RenameRequest, request: Request, owner: Owner):
    return request.app.state.files.rename(str(file_id), owner, body.filename)


@router.delete("/files/{file_id}", status_code=204)
def delete(file_id: UUID, request: Request, owner: Owner):
    request.app.state.files.delete(str(file_id), owner)
    return Response(status_code=204)
