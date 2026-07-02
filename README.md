# SDLC Conductor

**Turn requirements into specs + tickets, track builds from git activity, and flag when code drifts from what was agreed.**

Built with [Continuum](https://github.com/shyftlabs/continuum) (Python agent framework) and Next.js.

## Features

- **Requirement → Spec + Tickets** — Paste a product requirement; Continuum agents generate a technical spec and actionable tickets with acceptance criteria.
- **Git Activity Tracking** — Sync commits from GitHub or a local repository.
- **Drift Detection** — Compare agreed specs/tickets against git activity; get alignment scores and remediation recommendations.
- **Project Dashboard** — Track alignment, open drift alerts, and ticket status across projects.

## Architecture

```
┌─────────────────┐     REST API      ┌──────────────────────────────┐
│  Next.js UI     │ ◄──────────────► │  FastAPI + Continuum Agents   │
│  (port 3000)    │                   │  (port 8096)                  │
└─────────────────┘                   │  • Requirements Analyst       │
                                      │  • Drift Detector             │
                                      └──────────┬───────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────┐
                    ▼                            ▼                    ▼
              SQLite store              OpenAI / LLM            GitHub / local git
```

## Quick start

### 1. Backend

```bash
cd sdlc-conductor/backend
python3.13 -m venv .venv
source .venv/bin/activate
cp .env.example .env
# Add your API key to .env (see LLM_PROVIDER below)

pip install -r requirements.txt
pip install ../../continuum-main
./start.sh
```

API runs at **http://localhost:8096**

### LLM provider

Set `LLM_PROVIDER` in `backend/.env` to choose the agent backend:

| `LLM_PROVIDER` | API key | Default model |
|----------------|---------|---------------|
| `OPENAI` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `GEMINI` | `GEMINI_API_KEY` | `gemini/gemini-2.5-flash` |
| `AURA` | `SMART_GATEWAY_URL` + `SMART_GATEWAY_API_KEY` | `auto` |

**OpenAI example:**
```env
LLM_PROVIDER=OPENAI
OPENAI_API_KEY=sk-...
```

**Gemini example:**
```env
LLM_PROVIDER=GEMINI
GEMINI_API_KEY=AIza...
```

**Aura Smart Gateway example:**
```env
LLM_PROVIDER=AURA
SMART_GATEWAY_URL=https://continuum.shyftops.io/v1
SMART_GATEWAY_API_KEY=sk-...
SMART_GATEWAY_DEFAULT_MODE=modest
```

Override the model anytime with `DEFAULT_LLM_MODEL` (e.g. `gemini/gemini-2.0-flash`, `gpt-4o`, or `auto`).

### 2. Frontend

```bash
cd sdlc-conductor/frontend
cp .env.local.example .env.local
npm install
npm run dev
```

UI runs at **http://localhost:3000**

### 3. Optional: GitHub integration

For private repos or higher rate limits, add to `backend/.env`:

```
GITHUB_TOKEN=ghp_your-token-here
```

Alternatively, set `local_repo_path` when creating a project to sync from a local git checkout (no token needed).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | No | `OPENAI` (default), `GEMINI`, or `AURA` |
| `OPENAI_API_KEY` | If provider=OPENAI | Powers spec generation and drift detection |
| `GEMINI_API_KEY` | If provider=GEMINI | Google Gemini API key |
| `SMART_GATEWAY_URL` | If provider=AURA | Aura gateway base URL |
| `SMART_GATEWAY_API_KEY` | If provider=AURA | Aura gateway API key |
| `SMART_GATEWAY_DEFAULT_MODE` | No | `strict`, `modest` (default), or `quality` |
| `DEFAULT_LLM_MODEL` | No | Override default model for the active provider |
| `LLM_FALLBACK_MODELS` | No | Comma-separated fallback models on rate limit |
| `GITHUB_TOKEN` | No | For GitHub API (private repos) |
| `JIRA_SITE_URL` | No | JIRA Cloud URL (e.g. `https://yourorg.atlassian.net`) |
| `JIRA_EMAIL` | No | Atlassian account email for API auth |
| `JIRA_API_TOKEN` | No | [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `SDLC_CONDUCTOR_PORT` | No | API port (default `8096`) |
| `NEXT_PUBLIC_API_URL` | No | Frontend API base (default `http://localhost:8096`) |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/projects` | List / create projects |
| GET | `/api/projects/{id}` | Project detail |
| POST | `/api/projects/{id}/analyze` | Generate spec + tickets |
| POST | `/api/projects/{id}/git/sync` | Sync commits (optional `{ "branch": "..." }` body) |
| GET | `/api/projects/{id}/git/branches` | List remote/local branches |
| POST | `/api/projects/{id}/drift/check` | Run drift analysis |
| PATCH | `/api/tickets/{id}` | Update ticket status |

## Continuum agents

- **Requirements Analyst** — Structured output (`RequirementAnalysisResult`) with spec and tickets.
- **Drift Detector** — Compares spec/tickets against git activity; returns alignment score and findings.

Both use `BaseAgent` + `AgentRunner` with schema-validated structured outputs.

### AI Command Center (new)

| Feature | Endpoint | What it does |
|---------|----------|--------------|
| **Run Magic ✨** | `POST .../ai/magic` | Runs all AI agents in parallel |
| **Standup digest** | `POST .../ai/standup` | Daily standup script + Slack message |
| **Sprint planner** | `POST .../ai/sprint-plan` | Groups tickets into sprints |
| **Release readiness** | `POST .../ai/readiness` | Ship / caution / not-ready verdict |
| **Scope creep radar** | `POST .../ai/scope-creep` | Flags unplanned work vs spec |
| **Commit linker** | `POST .../ai/link-commits` | AI links commits → tickets |
| **Ask the project** | `POST .../ai/chat` | Natural language Q&A |
| **Cached insights** | `GET .../command-center` | Latest AI results |

### JIRA integration

| Feature | Endpoint | What it does |
|---------|----------|--------------|
| **Status** | `GET .../jira/status` | Connection + linked ticket count |
| **Configure** | `PUT .../jira/config` | Set JIRA site URL + project key |
| **Push to JIRA** | `POST .../jira/push` | Create JIRA issues for unlinked tickets |
| **Sync status** | `POST .../jira/sync` | Pull JIRA statuses into local tickets |

Local status changes also attempt to transition linked JIRA issues.

## License

Apache 2.0 (Continuum framework). Application code follows the same spirit — use freely for your hackathon/project.
