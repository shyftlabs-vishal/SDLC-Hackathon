# SDLC Conductor — Metrics & Calculation Reference

This document explains **how every score, count, and metric in the product is calculated**. Use it for demos, judging Q&A, and onboarding.

There are two kinds of metrics:

| Type | How computed | Examples |
|------|----------------|----------|
| **Deterministic** | Fixed formulas in Python/TypeScript | Performance analytics, dashboard counts |
| **AI-generated** | Continuum LLM agent output (structured JSON) | Drift alignment, release readiness, PR review |

---

## 1. Performance Analytics (deterministic)

**Where shown:** Project → Overview → *Performance analytics*  
**API:** `GET /api/projects/{id}/performance`  
**Source code:** `backend/performance_analytics.py`

This is the main **project health score**. It combines ticket delivery, spec alignment, drift alerts, and git activity into one **0–100 overall score**.

### 1.1 Overall performance score

```
overall = (Delivery × 35%) + (Spec alignment × 25%) + (Drift health × 25%) + (Git activity × 15%)
```

All sub-scores are clamped to **0–100** before weighting. Result is rounded to an integer.

### 1.2 Performance grades

| Grade | Score range |
|-------|-------------|
| Excellent | 85 – 100 |
| Good | 70 – 84 |
| Fair | 50 – 69 |
| At risk | 30 – 49 |
| Critical | 0 – 29 |

### 1.3 Breakdown status labels

Each breakdown bar is labeled **strong**, **moderate**, or **weak**:

| Status | Sub-score |
|--------|-----------|
| Strong | ≥ 75 |
| Moderate | 50 – 74 |
| Weak | &lt; 50 |

---

### 1.4 Delivery score (35% weight)

**Inputs:** All tickets on the project, grouped by status.

**Raw counts:**
- `done`, `in_progress`, `in_review`, `backlog`, `blocked`
- `total_tickets` = count of all tickets

**Displayed metrics:**

| Metric | Formula |
|--------|---------|
| `completion_rate` | `(done / total_tickets) × 100` |
| `points_total` | Sum of `estimated_points` on all tickets (null → 0) |
| `points_done` | Sum of `estimated_points` on tickets with status `done` |
| `points_completion_rate` | `(points_done / points_total) × 100` if points_total &gt; 0, else `completion_rate` |

**Delivery sub-score (0–100):**

```
partial_credit = ((in_progress + in_review) / total) × 100 × 0.45
blocked_penalty = min(25, (blocked / total) × 100 × 0.6)

delivery_score = completion_rate × 0.55
               + partial_credit × 0.25
               + points_rate × 0.20
               − blocked_penalty

delivery_score = max(0, delivery_score)
```

If there are **no tickets**, delivery score = **0**.

**Interpretation:**
- Done tickets count most (55%).
- In-progress and in-review tickets get partial credit (25%).
- Story points completed add another signal (20%).
- Blocked tickets reduce the score (up to −25 points).

---

### 1.5 Spec alignment component (25% weight)

**Primary input:** `project.alignment_score` — set by the **last drift check** (see §2).

| Condition | Value used in performance formula |
|-----------|-----------------------------------|
| Drift check has been run | Latest `alignment_score` (0–100) |
| Never run | Estimated: `max(0, 100 − open_alerts×8 − critical_open×12)` |

This component measures **how well implementation matches the agreed spec and tickets**.

---

### 1.6 Drift health score (25% weight)

**Inputs:** All drift alerts (open + resolved).

**Severity penalties (per open alert):**

| Severity | Penalty points |
|----------|----------------|
| Critical | 20 |
| High | 10 |
| Medium | 5 |
| Low | 2 |

```
drift_penalty = Σ (penalty for each open alert)

resolved_ratio = resolved_alerts / max(total_alerts, 1)
resolution_bonus = resolved_ratio × 15   (only if any alerts exist)

health_score = max(0, 100 − drift_penalty + resolution_bonus × 0.3)
```

**Displayed metrics:**
- `open_alerts` — unresolved drift alerts
- `resolved_alerts` — alerts marked resolved
- `critical_open`, `high_open` — open counts by severity
- `drift_penalty` — clamped penalty sum (0–100)
- `health_score` — clamped health score (0–100)

**Interpretation:** More severe open drift → lower health. Resolving past alerts gives a small bonus.

---

### 1.7 Git activity score (15% weight)

**Inputs:** `recent_commits` (synced commits, up to 50 stored) and whether a repo is linked.

**Counts:**
- `commits_last_7d` — commits with `committed_at` in the last 7 days
- `commits_last_14d` — commits in the last 14 days
- `commits_tracked` — total synced commits shown on the project

**Activity score:**

| Condition | Score |
|-----------|-------|
| No repo linked | 40 (baseline) |
| Repo linked, zero commits synced | 15 |
| Repo linked, has commits | `min(100, commits_7d×18 + commits_14d×6 + min(commits_tracked, 20)×1.5)` |

**Interpretation:** Recent commit activity increases the score; stale or missing git data lowers it.

---

### 1.8 Recommendations (rule-based)

Up to **6** recommendations are generated from thresholds (not AI):

| Trigger | Priority |
|---------|----------|
| No tickets | High — generate spec/tickets |
| Completion &lt; 40% and blocked &gt; 0 | High — unblock work |
| Completion &lt; 50% | Medium — increase throughput |
| No drift check ever run | Medium — run drift check |
| Critical or high open drift | High — address alerts |
| More than 3 open drift alerts | Medium — reduce backlog |
| Repo linked, 0 commits in 7 days | Medium — sync git |
| No repo linked | Low — connect repository |
| Any breakdown factor is "weak" | Medium — improve that area |

---

## 2. Drift detection & alignment score (AI)

**Where shown:** Drift tab, project badge, performance analytics, dashboard hero  
**API:** `POST /api/projects/{id}/drift/check`  
**Source code:** `backend/agents.py` (Drift agent), `backend/store.py` (persistence)

### 2.1 What the drift agent does

The **Drift Detector** (Continuum agent) compares:

- Project **spec** (goals, acceptance criteria, technical approach)
- **Tickets** and their statuses
- **Recent git commits** (messages, files changed)

It returns structured JSON including:

| Field | Range | Meaning |
|-------|-------|---------|
| `alignment_score` | 0–100 | 100 = perfect alignment with spec and tickets |
| `findings` | list | Drift alerts with severity, evidence, recommendation |
| `covered_requirements` | list | Spec/ticket items with git evidence |
| `missing_requirements` | list | Spec/ticket items with no git evidence |

**Agent guidance** (from prompt):
- Only flag **real** drift; do not invent issues
- Severity: `critical` (wrong behavior/security), `high` (missing core feature), `medium` (partial), `low` (minor), `info` (observation)
- If **no git activity**, score based on ticket backlog vs spec completeness

### 2.2 Persistence

After a drift check:

1. `projects.alignment_score` is updated to the new score
2. Each finding is saved as a row in `drift_alerts`
3. Open drift count on dashboard cards = `COUNT(*) WHERE resolved = 0`

### 2.3 UI color thresholds (alignment badge)

Used in frontend only (`frontend/src/lib/utils.ts`) — **not** the performance grade:

| Alignment score | Color |
|-----------------|-------|
| ≥ 80 | Green (healthy) |
| 60 – 79 | Amber (warning) |
| &lt; 60 | Red (at risk) |
| null | Gray (not checked) |

---

## 3. Dashboard aggregates (deterministic)

**Where shown:** Home page hero stats  
**Source code:** `frontend/src/app/page.tsx`

| Stat | Calculation |
|------|-------------|
| **Projects** | `projects.length` |
| **Tickets** | Sum of `ticket_count` across all projects |
| **Drift** | Sum of `open_drift_count` across all projects |
| **Avg Align** | Mean of `alignment_score` for projects where score is not null; `—` if none checked |

Per-project on dashboard cards:

| Field | Calculation |
|-------|-------------|
| `ticket_count` | `COUNT(tickets)` for project |
| `open_drift_count` | `COUNT(drift_alerts WHERE resolved = 0)` |
| `alignment_score` | Last drift check score (or null) |

---

## 4. Command Center AI scores (AI-generated)

**Where shown:** Command Center tab  
**Source code:** `backend/ai_agents.py`, cached via `save_ai_insight`

These scores are **produced by LLM agents**, not fixed formulas. Prompts define intended ranges and meaning.

### 4.1 Release readiness

| Field | Range | Verdict rules (prompt) |
|-------|-------|------------------------|
| `readiness_score` | 0–100 | **ship** if ≥ 80, **caution** if 50–79, **not_ready** if &lt; 50 |

Considers: ticket completion %, alignment score, drift alerts, open questions, scope creep risk.

### 4.2 Scope creep

| Field | Range | Meaning |
|-------|-------|---------|
| `creep_score` | 0–100 | **Higher = more scope creep** detected |

Compares git activity and tickets against spec **goals** and **non_goals**.

### 4.3 Commit → ticket linking

| Field | Range | Meaning |
|-------|-------|---------|
| `confidence` | 0.0 – 1.0 | How confident the AI is that commits belong to a ticket |

**Apply links** (`POST /api/projects/{id}/ai/apply-commit-links`):
- Default minimum confidence: **0.5**
- One link per ticket title (highest confidence wins)
- Updates ticket status to `suggested_status` when applied

### 4.4 Standup digest

No numeric score — generates narrative, blockers, wins, and suggestions from project context.

### 4.5 Sprint plan

No single score — groups tickets into sprints with `total_points` per sprint vs `capacity_per_sprint` (default 21).

---

## 5. PR Review Agent (AI-generated)

**Where shown:** Git tab → PR Review Agent  
**API:** `POST /api/projects/{id}/ai/review-pr`  
**Source code:** `backend/ai_agents.py`, `backend/project_context.py`

| Field | Values / range | Meaning |
|-------|----------------|---------|
| `alignment_score` | 0–100 | How well the PR matches spec/tickets |
| `verdict` | approve / request_changes / needs_discussion | Merge recommendation |
| `linked_tickets` | ticket titles | Tickets this PR appears to address |
| `findings` | list | Spec gaps, scope creep, quality issues |
| `acceptance_criteria_gaps` | list | Ticket criteria not covered by the diff |

Context includes: spec, tickets, drift alerts, PR title/body, and file diffs (truncated).

---

## 6. Quick reference — formula summary

```
PERFORMANCE OVERALL =
    delivery_score      × 0.35
  + alignment_component × 0.25
  + drift_health_score  × 0.25
  + git_activity_score  × 0.15

delivery_score =
    completion_rate × 0.55
  + partial_credit  × 0.25
  + points_rate     × 0.20
  − blocked_penalty

drift_health_score =
    max(0, 100 − Σ(severity_penalties) + resolved_bonus × 0.3)

git_activity_score =
    min(100, commits_7d×18 + commits_14d×6 + min(commits_tracked,20)×1.5)
    (or 40 / 15 baselines if no repo / no commits)
```

---

## 7. Source file map

| Feature | Backend | Frontend |
|---------|---------|----------|
| Performance analytics | `performance_analytics.py` | `components/performance-analytics.tsx` |
| Drift / alignment | `agents.py`, `store.py` | Drift tab, badges |
| Dashboard stats | `store.py` | `app/page.tsx` |
| Release readiness | `ai_agents.py` | `components/command-center.tsx` |
| Scope creep | `ai_agents.py` | Command Center |
| Commit links | `ai_agents.py`, `server.py` | Command Center |
| PR review | `ai_agents.py`, `git_service.py` | `components/pr-review-panel.tsx` |
| UI alignment colors | — | `lib/utils.ts` |

---

## 8. FAQ for demos

**Q: Why is performance "Critical" when we have tickets?**  
A: Performance needs delivery progress *and* ideally a drift check + git sync. Zero completion, no alignment baseline, or many open drift alerts all pull the score down.

**Q: Is alignment score the same as performance score?**  
A: No. **Alignment** (from drift check) is one input — it contributes **25%** to performance. Performance also weighs delivery (35%), drift health (25%), and git activity (15%).

**Q: Why did alignment change after drift check?**  
A: Each drift check **replaces** `project.alignment_score` with the agent's latest assessment. Performance analytics picks up the new value on refresh.

**Q: Which scores are AI vs calculated?**  
A: **Calculated:** performance analytics, dashboard counts, git commit stats. **AI:** drift alignment, readiness, scope creep, commit links, PR review, standup, sprint plan.

**Q: Do I need to restart the backend after pulling new metrics code?**  
A: Yes. New API routes (e.g. `/performance`) return 404 until the server is restarted with the latest code.
