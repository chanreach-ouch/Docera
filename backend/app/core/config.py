from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DOCERA_", env_file=".env", extra="ignore")

    data_dir: Path = Path(__file__).resolve().parents[3] / ".docera-data"
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    max_pages: int = Field(default=500, ge=1, le=1000)
    retention_seconds: int = Field(default=24 * 3600, ge=60)
    cleanup_interval_seconds: int = Field(default=60, ge=1)
    inspection_timeout_seconds: float = Field(default=15, ge=0.01, le=120)
    session_quota_bytes: int = Field(default=250 * 1024 * 1024, ge=1024)
    total_quota_bytes: int = Field(default=1024 * 1024 * 1024, ge=1024)
    max_session_files: int = Field(default=100, ge=1, le=1000)
    secure_cookie: bool = False
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver", "api"]
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:8000", "http://127.0.0.1:8000", "http://testserver"]
