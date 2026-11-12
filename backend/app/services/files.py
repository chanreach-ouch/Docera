import re
import threading
import time
import unicodedata
from datetime import datetime, timezone
from typing import BinaryIO
from uuid import uuid4

from app.core.config import Settings
from app.core.errors import AppError
from app.repositories.files import FileRepository
from app.services.pdf.inspection import inspect_pdf
from app.services.storage.local import BlobStorage, LocalStorage


def safe_filename(name: str | None) -> str:
    name = unicodedata.normalize("NFKC", name or "document.pdf").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f<>:\"|?*\u202a-\u202e\u2066-\u2069]", "_", name).strip(" .")
    stem = name[:-4] if name.lower().endswith(".pdf") else name
    return (stem[:140] or "document") + ".pdf"


class FileService:
    def __init__(self, settings: Settings, repository: FileRepository, storage: BlobStorage):
        self.settings = settings
        self.repository = repository
        self.storage = storage
        self.lock = threading.RLock()

    def upload(self, source: BinaryIO, filename: str | None, owner: str) -> dict:
        file_id = str(uuid4())
        staged = self.storage.create(file_id)
        try:
            size = 0
            with staged.open("xb") as destination:
                while chunk := source.read(64 * 1024):
                    size += len(chunk)
                    if size > self.settings.max_upload_bytes:
                        raise AppError("file_too_large", "This file exceeds the upload size limit.", 413)
                    destination.write(chunk)
            if not size:
                raise AppError("empty_file", "The selected file is empty.", 422)
            pages = inspect_pdf(staged, self.settings.max_pages, self.settings.inspection_timeout_seconds)
            now = time.time()
            expires = now + self.settings.retention_seconds
            document = dict(id=file_id, filename=safe_filename(filename), size_bytes=size, page_count=len(pages), pages=pages, created_at=datetime.fromtimestamp(now, timezone.utc).isoformat(), expires_at=datetime.fromtimestamp(expires, timezone.utc).isoformat())
            with self.lock:
                self.cleanup()
                session_bytes, total_bytes, count = self.repository.usage(owner)
                if count >= self.settings.max_session_files or session_bytes + size > self.settings.session_quota_bytes or total_bytes + size > self.settings.total_quota_bytes:
                    raise AppError("storage_limit", "Document storage is full. Remove a document and try again.", 413)
                staged.replace(self.storage.source(file_id))
                self.repository.add(document, owner, expires)
            return document
        except BaseException:
            self.storage.delete(file_id)
            raise

    def save_bytes(self, owner: str, filename: str, data: bytes) -> dict:
        import io
        return self.upload(io.BytesIO(data), filename, owner)

    def get(self, file_id: str, owner: str) -> dict:
        document = self.repository.get(file_id, owner, time.time())
        if not document or not self.storage.source(file_id).is_file():
            raise AppError("file_not_found", "This document is unavailable. It may have expired or been removed.", 404)
        return document

    def list_for_owner(self, owner: str) -> list[dict]:
        return self.repository.list_for_owner(owner, time.time())

    def rename(self, file_id: str, owner: str, new_name: str) -> dict:
        with self.lock:
            document = self.get(file_id, owner)
            document["filename"] = safe_filename(new_name)
            self.repository.update_document(file_id, owner, document)
            return document

    def delete(self, file_id: str, owner: str):
        with self.lock:
            self.get(file_id, owner)
            self.storage.delete(file_id)
            self.repository.delete(file_id)

    def cleanup(self):
        with self.lock:
            for file_id in self.repository.expired(time.time()):
                self.storage.delete(file_id)
                self.repository.delete(file_id)

    def recover(self):
        with self.lock:
            self.cleanup()
            if isinstance(self.storage, LocalStorage):
                self.storage.remove_orphans(self.repository.ids())
