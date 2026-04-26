# CodeReview AI — UI

A button-driven UI for the multi-agent code review system.
No chat interface — just click buttons and see results.

## How to Run

### 1. Start the ADK API server (from workspace root)
```bash
adk api_server
```
This starts the backend at `http://localhost:8000`.

### 2. Open the UI
Just open `ui/index.html` in your browser.
No build step, no npm, no server needed — it's plain HTML/CSS/JS.

## What the UI Does

| Button | What Happens |
|--------|-------------|
| Start Analysis | Scans the project (local path or GitHub URL) |
| Security Review | Runs vulnerability scan + generates CODE_REVIEW.md |
| Dockerize | Creates Dockerfile, builds & runs container |
| Generate Tests | Auto-generates pytest tests, runs them, shows pass/fail |
| Run Everything | All three in sequence with a summary table |
| Ask a Question | Ask anything about the project after analysis |

## ADK API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /list-apps` | Health check |
| `POST /apps/{app}/users/{user}/sessions/{id}` | Create session |
| `POST /run` | Send message, get response |
