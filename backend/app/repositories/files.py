import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class FileRepository:
    def __init__(self, database: Path):
        self.database = database
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL, size INTEGER NOT NULL, document TEXT NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS files_owner ON files(owner)")
            db.execute("CREATE INDEX IF NOT EXISTS files_expires ON files(expires)")

    @contextmanager
    def connection(self):
        with sqlite3.connect(self.database, timeout=10) as db:
            db.row_factory = sqlite3.Row
            yield db

    def add(self, document: dict, owner: str, expires: float):
        with self.connection() as db:
            db.execute("INSERT INTO files VALUES (?, ?, ?, ?, ?)", (document["id"], owner, expires, document["size_bytes"], json.dumps(document)))

    def get(self, file_id: str, owner: str, now: float) -> dict | None:
        with self.connection() as db:
            row = db.execute("SELECT document FROM files WHERE id=? AND owner=? AND expires>?", (file_id, owner, now)).fetchone()
        return json.loads(row[0]) if row else None

    def list_for_owner(self, owner: str, now: float) -> list[dict]:
        with self.connection() as db:
            rows = db.execute("SELECT document FROM files WHERE owner=? AND expires>? ORDER BY rowid DESC", (owner, now)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def usage(self, owner: str) -> tuple[int, int, int]:
        with self.connection() as db:
            total = db.execute("SELECT COALESCE(SUM(size), 0) FROM files").fetchone()[0]
            row = db.execute("SELECT COALESCE(SUM(size), 0), COUNT(*) FROM files WHERE owner=?", (owner,)).fetchone()
        return row[0], total, row[1]

    def expired(self, now: float) -> list[str]:
        with self.connection() as db:
            return [row[0] for row in db.execute("SELECT id FROM files WHERE expires<=?", (now,))]

    def ids(self) -> set[str]:
        with self.connection() as db:
            return {row[0] for row in db.execute("SELECT id FROM files")}

    def delete(self, file_id: str):
        with self.connection() as db:
            db.execute("DELETE FROM files WHERE id=?", (file_id,))

    def update_document(self, file_id: str, owner: str, document: dict):
        with self.connection() as db:
            db.execute("UPDATE files SET document=? WHERE id=? AND owner=?", (json.dumps(document), file_id, owner))
