# ── Backend Dockerfile (FastAPI / Python) ─────────────────────────────────────
# Containerizes the reference FastAPI verify-engine for cloud deployment.
# Uses a slim Python base, installs deps, runs under uvicorn with multiple
# workers behind Gunicorn for production throughput.

FROM python:3.11-slim AS base

# Metadata
LABEL org.opencontainers.image.title="academic-verify-engine"
LABEL org.opencontainers.image.description="FastAPI backend for the Academic Verification Platform"
LABEL org.opencontainers.image.version="1.0.0"

# Prevent Python from writing .pyc files and force unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system deps required by pypdf / httpx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt gunicorn==22.0.0

# Copy the application code
COPY . .

# Expose the FastAPI port
EXPOSE 8000

# Healthcheck — hit the /health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run under Gunicorn with uvicorn workers (4 workers, 16 threads each).
# Adapts to cloud DATABASE_URL / PORT environment variables automatically.
CMD sh -c 'gunicorn main:app \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers ${WEB_CONCURRENCY:-4} \
    --worker-class uvicorn.workers.UvicornWorker \
    --threads 16 \
    --timeout 120 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -'
