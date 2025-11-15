# Analytics Backend

This repository contains a simple analytics backend composed of:
- An ingestion API that accepts events and enqueues them.
- A background worker that persists events to Postgres.
- A reporting endpoint that returns aggregated daily stats.

## Services
- **POST /event** — Accepts event JSON and enqueues for processing.
- **GET /stats?site_id=...&date=YYYY-MM-DD** — Returns aggregated stats for a site and date.

## Quick start (Docker)
Requirements: Docker and Docker Compose.

1. From repo root:
   ```bash
   docker-compose up --build
   ```
2. API will be available at `http://localhost:3000`.

## Example requests
Ingest:
```bash
curl -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "site-abc-123",
    "event_type": "page_view",
    "path": "/pricing",
    "user_id": "user-xyz-789",
    "timestamp": "2025-11-12T19:30:01Z"
  }'
```

Stats:
```bash
curl "http://localhost:3000/stats?site_id=site-abc-123&date=2025-11-12"
```

## Database
The Postgres initialization script is in `migrations/init.sql`. It creates a single `events` table.

## Notes
- The ingestion path returns quickly by writing to Redis only.
- The worker performs the DB insert; duplicates are possible with retries.
- For production, consider stronger guarantees (dedup keys, durable queue, monitoring).

## License
MIT
