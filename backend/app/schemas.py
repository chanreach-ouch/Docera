from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PageInfo(BaseModel):
    index: int
    width: float
    height: float
    rotation: int
    user_unit: float = 1
    media_box: list[float] = Field(min_length=4, max_length=4)
    crop_box: list[float] = Field(min_length=4, max_length=4)


class FileSummary(BaseModel):
    id: UUID
    filename: str
    size_bytes: int
    page_count: int
    created_at: datetime
    expires_at: datetime


class FileDetail(FileSummary):
    pages: list[PageInfo]


class FileList(BaseModel):
    files: list[FileSummary]


class SessionInfo(BaseModel):
    max_upload_bytes: int
    max_pages: int
    retention_seconds: int
    max_session_files: int
    session_quota_bytes: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthInfo(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = "0.1.0"
