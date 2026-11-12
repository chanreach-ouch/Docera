import shutil
from pathlib import Path
from typing import Protocol
from uuid import UUID


class BlobStorage(Protocol):
    def create(self, file_id: str) -> Path: ...
    def source(self, file_id: str) -> Path: ...
    def delete(self, file_id: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def directory(self, file_id: str) -> Path:
        # Canonical UUIDs are the ONLY accepted blob directory names.
        if str(UUID(file_id)) != file_id:
            raise ValueError("Invalid internal file identifier")
        directory = self.root / file_id
        if directory.is_symlink() or directory.resolve().parent != self.root:
            raise ValueError("Unsafe blob location")
        return directory

    def create(self, file_id: str) -> Path:
        directory = self.directory(file_id)
        directory.mkdir(mode=0o700)
        return directory / "upload.part"

    def source(self, file_id: str) -> Path:
        return self.directory(file_id) / "source.pdf"

    def delete(self, file_id: str) -> None:
        directory = self.directory(file_id)
        if directory.exists():
            # Only the checked UUID directory inside the private blob root.
            shutil.rmtree(directory)

    def remove_orphans(self, known_ids: set[str]) -> None:
        for directory in self.root.iterdir():
            try:
                if directory.is_dir() and directory.name not in known_ids:
                    self.delete(directory.name)
            except ValueError:
                # Never touch unrecognized user/operator entries.
                continue
