# Backend — FastAPI Verify Engine (Reference)

The **reference Python implementation** of the citation verification engine. In
the live sandbox the engine runs as a decoupled TypeScript module
(`src/server/verify-engine/`) for environment compatibility; this Python
service documents the same contract for deployment to any Python runtime.

## Contract

```
POST /api/verify
    multipart/form-data:
        file:          PDF file
        author:        string
        quote:         string
        expected_page: string (optional)
    -> JSON:
        status:    VERIFIED_EXACT | VERIFIED_CORRECTED | ALTERNATIVE_FOUND | NOT_FOUND
        message:   string
        page:      string | null
        alternative: { title, author, year, publisher, fullApa } | null
```

## Local Development

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Docker Deployment

```bash
docker build -t academic-verify-engine .
docker run -p 8000:8000 -e DATABASE_URL=... academic-verify-engine
```

The container runs Gunicorn with uvicorn workers (4 workers, 16 threads each)
and adapts to `PORT` and `WEB_CONCURRENCY` environment variables.

## Environment Variables

| Variable         | Default | Description                          |
|------------------|---------|--------------------------------------|
| `PORT`           | `8000`  | HTTP port                            |
| `WEB_CONCURRENCY`| `4`     | Number of Gunicorn workers           |
| `DATABASE_URL`   | —       | Database connection (future use)     |
