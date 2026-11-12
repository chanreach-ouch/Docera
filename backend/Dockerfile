FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Install runtime dependencies: poppler-utils (pdf images), qpdf, tesseract OCR, fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    poppler-utils \
    qpdf \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-khm \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast, reliable Python dependency installation
COPY --from=ghcr.io/astral-sh/uv:0.5.15 /uv /bin/uv

# Copy dependency definition
COPY pyproject.toml uv.lock* ./

# Install locked dependencies into system python
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application source
COPY app ./app

# Create non-root user and data dir
RUN groupadd -g 1001 docera && \
    useradd -u 1001 -g docera -m -s /bin/bash docera && \
    mkdir -p /app/data && \
    chown -R docera:docera /app

USER docera

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/api/v1/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
