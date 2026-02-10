# Parliament Debate Pipeline

Automated parliamentary debate detection, transcription, summarization, and forum publishing service for Vox.Vote.

## Architecture

- **FastAPI** - REST API for triggering polls and monitoring status
- **Celery + Redis** - Task queue for async pipeline processing
- **faster-whisper** - Speech-to-text transcription (EN/FR)
- **OpenAI GPT-4o** - Debate summarization and categorization
- **Supabase** - Database and storage

## Pipeline Stages

1. **Poll** - Check parliamentary calendars for new sessions
2. **Ingest** - Download audio/video from official sources
3. **Transcribe** - Run Whisper speech-to-text
4. **Process** - Map speakers via Hansard, extract contributions and votes
5. **Summarize** - Generate EN/FR layperson summaries via LLM
6. **Publish** - Create forum post in Supabase

## Supported Legislatures

- **CA** - House of Commons (Federal)
- **ON** - Ontario Legislature
- **QC** - National Assembly of Quebec

## Local Development

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Start all services
docker-compose up --build

# Or run individually:
# API server
uvicorn app.main:app --reload --port 8000

# Celery worker
celery -A app.celery_app worker --loglevel=info

# Celery beat (scheduler)
celery -A app.celery_app beat --loglevel=info
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/poll` | Trigger debate polling |
| GET | `/api/status` | Pipeline status overview |
| GET | `/api/debates` | List debates with filters |
| POST | `/api/retrigger` | Re-trigger a debate from a specific stage |

All endpoints except `/health` require `X-API-Key` header.

## Deployment (Railway)

1. Create a new Railway service from this directory
2. Add a Redis addon
3. Set environment variables (see `.env.example`)
4. Deploy - Railway will use the Dockerfile
5. For the worker, create a second service with the same code but override the start command:
   ```
   celery -A app.celery_app worker --loglevel=info --concurrency=2
   ```

## Environment Variables

See `.env.example` for the full list. Key variables:

- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` - Database access
- `REDIS_URL` - Task queue broker
- `OPENAI_API_KEY` - LLM summarization
- `WHISPER_MODEL` - Whisper model size (default: `large-v3`)
- `SYSTEM_BOT_USER_ID` - Forum bot user UUID for posting (see below)
- `PIPELINE_API_KEY` - API authentication key

### Creating ParliamentBot (required for publishing)

The pipeline posts debate summaries as a system user. Create it once, then set the returned UUID as `SYSTEM_BOT_USER_ID`:

```bash
# From the forum directory (with .env.local or env vars set)
cd forum
npm run create-parliament-bot
```

Copy the printed UUID into your pipeline `.env` as `SYSTEM_BOT_USER_ID=<uuid>`. Do not use the literal string `SYSTEM_BOT_USER_ID` — it must be a valid UUID.
