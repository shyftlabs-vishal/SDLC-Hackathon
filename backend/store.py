"""SQLite persistence for SDLC Conductor."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from schemas import (
    DriftAlertResponse,
    DriftFinding,
    DriftSeverity,
    GeneratedSpec,
    GeneratedTicket,
    GitCommitResponse,
    ProjectDetail,
    ProjectSummary,
    SpecResponse,
    TicketPriority,
    TicketResponse,
    TicketStatus,
    TicketType,
)

DB_PATH = Path(__file__).resolve().parent / "data" / "sdlc_conductor.db"


def _now() -> datetime:
    return datetime.now(UTC)


def _new_id() -> str:
    return str(uuid.uuid4())


@contextmanager
def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with _conn() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                requirement TEXT NOT NULL DEFAULT '',
                repo_url TEXT,
                repo_branch TEXT NOT NULL DEFAULT 'main',
                local_repo_path TEXT,
                jira_site_url TEXT,
                jira_project_key TEXT,
                alignment_score INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS specs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                overview TEXT NOT NULL,
                goals_json TEXT NOT NULL DEFAULT '[]',
                non_goals_json TEXT NOT NULL DEFAULT '[]',
                acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
                technical_approach TEXT NOT NULL DEFAULT '',
                constraints_json TEXT NOT NULL DEFAULT '[]',
                risks_json TEXT NOT NULL DEFAULT '[]',
                open_questions_json TEXT NOT NULL DEFAULT '[]',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                ticket_type TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'backlog',
                acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
                estimated_points INTEGER,
                dependencies_json TEXT NOT NULL DEFAULT '[]',
                jira_issue_key TEXT,
                jira_issue_id TEXT,
                jira_url TEXT,
                jira_synced_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS git_commits (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                sha TEXT NOT NULL,
                message TEXT NOT NULL,
                author TEXT NOT NULL,
                author_email TEXT NOT NULL DEFAULT '',
                committed_at TEXT NOT NULL,
                files_changed_json TEXT NOT NULL DEFAULT '[]',
                additions INTEGER NOT NULL DEFAULT 0,
                deletions INTEGER NOT NULL DEFAULT 0,
                url TEXT,
                UNIQUE(project_id, sha),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS drift_alerts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                spec_reference TEXT NOT NULL,
                code_evidence TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                affected_tickets_json TEXT NOT NULL DEFAULT '[]',
                alignment_score INTEGER,
                resolved INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_insights (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                insight_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_insights_project_type
            ON ai_insights(project_id, insight_type, created_at DESC);

            CREATE TABLE IF NOT EXISTS activity_events (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_activity_project_time
            ON activity_events(project_id, created_at DESC);
            """
        )
        _migrate_schema(db)


def _migrate_schema(db: sqlite3.Connection) -> None:
    project_cols = {row[1] for row in db.execute("PRAGMA table_info(projects)").fetchall()}
    if "jira_site_url" not in project_cols:
        db.execute("ALTER TABLE projects ADD COLUMN jira_site_url TEXT")
    if "jira_project_key" not in project_cols:
        db.execute("ALTER TABLE projects ADD COLUMN jira_project_key TEXT")

    ticket_cols = {row[1] for row in db.execute("PRAGMA table_info(tickets)").fetchall()}
    for col, ddl in (
        ("jira_issue_key", "ALTER TABLE tickets ADD COLUMN jira_issue_key TEXT"),
        ("jira_issue_id", "ALTER TABLE tickets ADD COLUMN jira_issue_id TEXT"),
        ("jira_url", "ALTER TABLE tickets ADD COLUMN jira_url TEXT"),
        ("jira_synced_at", "ALTER TABLE tickets ADD COLUMN jira_synced_at TEXT"),
        ("assignee", "ALTER TABLE tickets ADD COLUMN assignee TEXT"),
        ("jira_assignee_account_id", "ALTER TABLE tickets ADD COLUMN jira_assignee_account_id TEXT"),
    ):
        if col not in ticket_cols:
            db.execute(ddl)


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _row_spec(row: sqlite3.Row) -> SpecResponse:
    return SpecResponse(
        id=row["id"],
        project_id=row["project_id"],
        title=row["title"],
        overview=row["overview"],
        goals=json.loads(row["goals_json"]),
        non_goals=json.loads(row["non_goals_json"]),
        acceptance_criteria=json.loads(row["acceptance_criteria_json"]),
        technical_approach=row["technical_approach"],
        constraints=json.loads(row["constraints_json"]),
        risks=json.loads(row["risks_json"]),
        open_questions=json.loads(row["open_questions_json"]),
        created_at=_parse_dt(row["created_at"]),
        version=row["version"],
    )


def _row_ticket(row: sqlite3.Row) -> TicketResponse:
    synced = row["jira_synced_at"] if row["jira_synced_at"] else None
    return TicketResponse(
        id=row["id"],
        project_id=row["project_id"],
        title=row["title"],
        description=row["description"],
        ticket_type=TicketType(row["ticket_type"]),
        priority=TicketPriority(row["priority"]),
        status=TicketStatus(row["status"]),
        acceptance_criteria=json.loads(row["acceptance_criteria_json"]),
        estimated_points=row["estimated_points"],
        dependencies=json.loads(row["dependencies_json"]),
        jira_issue_key=row["jira_issue_key"],
        jira_issue_id=row["jira_issue_id"],
        jira_url=row["jira_url"],
        jira_synced_at=_parse_dt(synced) if synced else None,
        assignee=row["assignee"] if "assignee" in row.keys() else None,
        jira_assignee_account_id=(
            row["jira_assignee_account_id"] if "jira_assignee_account_id" in row.keys() else None
        ),
        created_at=_parse_dt(row["created_at"]),
        updated_at=_parse_dt(row["updated_at"]),
    )


def _row_commit(row: sqlite3.Row) -> GitCommitResponse:
    return GitCommitResponse(
        id=row["id"],
        project_id=row["project_id"],
        sha=row["sha"],
        message=row["message"],
        author=row["author"],
        author_email=row["author_email"],
        committed_at=_parse_dt(row["committed_at"]),
        files_changed=json.loads(row["files_changed_json"]),
        additions=row["additions"],
        deletions=row["deletions"],
        url=row["url"],
    )


def _row_drift(row: sqlite3.Row) -> DriftAlertResponse:
    return DriftAlertResponse(
        id=row["id"],
        project_id=row["project_id"],
        severity=DriftSeverity(row["severity"]),
        title=row["title"],
        description=row["description"],
        spec_reference=row["spec_reference"],
        code_evidence=row["code_evidence"],
        recommendation=row["recommendation"],
        affected_tickets=json.loads(row["affected_tickets_json"]),
        alignment_score=row["alignment_score"],
        resolved=bool(row["resolved"]),
        created_at=_parse_dt(row["created_at"]),
    )


def create_project(
    name: str,
    description: str = "",
    requirement: str = "",
    repo_url: str | None = None,
    repo_branch: str = "main",
    local_repo_path: str | None = None,
    jira_site_url: str | None = None,
    jira_project_key: str | None = None,
) -> ProjectSummary:
    project_id = _new_id()
    now = _now().isoformat()
    with _conn() as db:
        db.execute(
            """
            INSERT INTO projects
            (id, name, description, requirement, repo_url, repo_branch, local_repo_path,
             jira_site_url, jira_project_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                name,
                description,
                requirement,
                repo_url,
                repo_branch,
                local_repo_path,
                jira_site_url,
                jira_project_key,
                now,
                now,
            ),
        )
    return get_project_summary(project_id)


def list_projects() -> list[ProjectSummary]:
    with _conn() as db:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [_project_summary_from_row(row) for row in rows]


def _project_summary_from_row(row: sqlite3.Row) -> ProjectSummary:
    project_id = row["id"]
    with _conn() as db:
        ticket_count = db.execute(
            "SELECT COUNT(*) FROM tickets WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
        open_drift = db.execute(
            "SELECT COUNT(*) FROM drift_alerts WHERE project_id = ? AND resolved = 0",
            (project_id,),
        ).fetchone()[0]
    return ProjectSummary(
        id=project_id,
        name=row["name"],
        description=row["description"],
        repo_url=row["repo_url"],
        repo_branch=row["repo_branch"],
        local_repo_path=row["local_repo_path"],
        jira_site_url=row["jira_site_url"],
        jira_project_key=row["jira_project_key"],
        alignment_score=row["alignment_score"],
        ticket_count=ticket_count,
        open_drift_count=open_drift,
        created_at=_parse_dt(row["created_at"]),
        updated_at=_parse_dt(row["updated_at"]),
    )


def get_project_summary(project_id: str) -> ProjectSummary:
    with _conn() as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise KeyError(f"Project {project_id} not found")
    return _project_summary_from_row(row)


def get_project_detail(project_id: str) -> ProjectDetail:
    summary = get_project_summary(project_id)
    with _conn() as db:
        project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise KeyError(f"Project {project_id} not found")
        spec_row = db.execute("SELECT * FROM specs WHERE project_id = ?", (project_id,)).fetchone()
        tickets = db.execute(
            "SELECT * FROM tickets WHERE project_id = ? ORDER BY created_at ASC",
            (project_id,),
        ).fetchall()
        commits = db.execute(
            "SELECT * FROM git_commits WHERE project_id = ? ORDER BY committed_at DESC LIMIT 50",
            (project_id,),
        ).fetchall()
        drifts = db.execute(
            "SELECT * FROM drift_alerts WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
    return ProjectDetail(
        **summary.model_dump(),
        requirement=project["requirement"],
        spec=_row_spec(spec_row) if spec_row else None,
        tickets=[_row_ticket(t) for t in tickets],
        recent_commits=[_row_commit(c) for c in commits],
        drift_alerts=[_row_drift(d) for d in drifts],
    )


def update_project(project_id: str, **fields: Any) -> ProjectSummary:
    allowed = {
        "name",
        "description",
        "repo_url",
        "repo_branch",
        "local_repo_path",
        "requirement",
        "jira_site_url",
        "jira_project_key",
    }
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return get_project_summary(project_id)
    updates["updated_at"] = _now().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id]
    with _conn() as db:
        db.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
    return get_project_summary(project_id)


def delete_project(project_id: str) -> None:
    with _conn() as db:
        db.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def save_analysis(
    project_id: str,
    requirement: str,
    spec: GeneratedSpec,
    tickets: list[GeneratedTicket],
) -> tuple[SpecResponse, list[TicketResponse]]:
    now = _now().isoformat()
    spec_id = _new_id()
    with _conn() as db:
        db.execute(
            "UPDATE projects SET requirement = ?, updated_at = ? WHERE id = ?",
            (requirement, now, project_id),
        )
        db.execute("DELETE FROM specs WHERE project_id = ?", (project_id,))
        db.execute("DELETE FROM tickets WHERE project_id = ?", (project_id,))
        db.execute(
            """
            INSERT INTO specs
            (id, project_id, title, overview, goals_json, non_goals_json,
             acceptance_criteria_json, technical_approach, constraints_json,
             risks_json, open_questions_json, version, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                spec_id,
                project_id,
                spec.title,
                spec.overview,
                json.dumps(spec.goals),
                json.dumps(spec.non_goals),
                json.dumps(spec.acceptance_criteria),
                spec.technical_approach,
                json.dumps(spec.constraints),
                json.dumps(spec.risks),
                json.dumps(spec.open_questions),
                now,
            ),
        )
        ticket_rows: list[TicketResponse] = []
        for ticket in tickets:
            ticket_id = _new_id()
            db.execute(
                """
                INSERT INTO tickets
                (id, project_id, title, description, ticket_type, priority, status,
                 acceptance_criteria_json, estimated_points, dependencies_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)
                """,
                (
                    ticket_id,
                    project_id,
                    ticket.title,
                    ticket.description,
                    ticket.ticket_type.value,
                    ticket.priority.value,
                    json.dumps(ticket.acceptance_criteria),
                    ticket.estimated_points,
                    json.dumps(ticket.dependencies),
                    now,
                    now,
                ),
            )
            row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
            ticket_rows.append(_row_ticket(row))
        spec_row = db.execute("SELECT * FROM specs WHERE id = ?", (spec_id,)).fetchone()
    return _row_spec(spec_row), ticket_rows


def update_ticket(
    ticket_id: str,
    status: TicketStatus | None = None,
    priority: TicketPriority | None = None,
    title: str | None = None,
    assignee: str | None = None,
    jira_assignee_account_id: str | None = None,
    *,
    sync_assignee: bool = False,
) -> TicketResponse:
    updates: dict[str, Any] = {"updated_at": _now().isoformat()}
    if title is not None:
        updates["title"] = title.strip()
    if status is not None:
        updates["status"] = status.value
    if priority is not None:
        updates["priority"] = priority.value
    if sync_assignee:
        updates["assignee"] = assignee
        updates["jira_assignee_account_id"] = jira_assignee_account_id
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [ticket_id]
    with _conn() as db:
        db.execute(f"UPDATE tickets SET {set_clause} WHERE id = ?", values)
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if row is None:
        raise KeyError(f"Ticket {ticket_id} not found")
    return _row_ticket(row)


def link_ticket_jira(
    ticket_id: str,
    issue_key: str,
    issue_id: str,
    url: str,
) -> TicketResponse:
    now = _now().isoformat()
    with _conn() as db:
        db.execute(
            """
            UPDATE tickets
            SET jira_issue_key = ?, jira_issue_id = ?, jira_url = ?,
                jira_synced_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (issue_key, issue_id, url, now, now, ticket_id),
        )
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if row is None:
        raise KeyError(f"Ticket {ticket_id} not found")
    return _row_ticket(row)


def get_ticket(ticket_id: str) -> TicketResponse:
    with _conn() as db:
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if row is None:
        raise KeyError(f"Ticket {ticket_id} not found")
    return _row_ticket(row)


def delete_ticket(ticket_id: str) -> None:
    with _conn() as db:
        row = db.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if row is None:
            raise KeyError(f"Ticket {ticket_id} not found")
        db.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))


def list_jira_issue_keys(project_id: str) -> set[str]:
    with _conn() as db:
        rows = db.execute(
            "SELECT jira_issue_key FROM tickets WHERE project_id = ? AND jira_issue_key IS NOT NULL",
            (project_id,),
        ).fetchall()
    return {row["jira_issue_key"] for row in rows if row["jira_issue_key"]}


def import_ticket_from_jira(
    project_id: str,
    *,
    title: str,
    description: str,
    ticket_type: TicketType,
    priority: TicketPriority,
    status: TicketStatus,
    issue_key: str,
    issue_id: str,
    url: str,
    assignee: str | None = None,
    jira_assignee_account_id: str | None = None,
) -> TicketResponse:
    now = _now().isoformat()
    ticket_id = _new_id()
    with _conn() as db:
        existing = db.execute(
            "SELECT id FROM tickets WHERE project_id = ? AND jira_issue_key = ?",
            (project_id, issue_key),
        ).fetchone()
        if existing:
            row = db.execute("SELECT * FROM tickets WHERE id = ?", (existing["id"],)).fetchone()
            return _row_ticket(row)

        db.execute(
            """
            INSERT INTO tickets
            (id, project_id, title, description, ticket_type, priority, status,
             acceptance_criteria_json, estimated_points, dependencies_json,
             jira_issue_key, jira_issue_id, jira_url, jira_synced_at,
             assignee, jira_assignee_account_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', NULL, '[]', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticket_id,
                project_id,
                title,
                description,
                ticket_type.value,
                priority.value,
                status.value,
                issue_key,
                issue_id,
                url,
                now,
                assignee,
                jira_assignee_account_id,
                now,
                now,
            ),
        )
        db.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    return _row_ticket(row)


def find_ticket_by_title(project_id: str, title: str) -> TicketResponse | None:
    title_norm = title.strip().lower()
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM tickets WHERE project_id = ?",
            (project_id,),
        ).fetchall()
    for row in rows:
        if row["title"].strip().lower() == title_norm:
            return _row_ticket(row)
    return None


def enrich_ticket_fields(
    ticket_id: str,
    *,
    acceptance_criteria: list[str] | None = None,
    estimated_points: int | None = None,
    priority: TicketPriority | None = None,
    ticket_type: TicketType | None = None,
) -> TicketResponse:
    updates: dict[str, Any] = {"updated_at": _now().isoformat()}
    if acceptance_criteria is not None:
        updates["acceptance_criteria_json"] = json.dumps(acceptance_criteria)
    if estimated_points is not None:
        updates["estimated_points"] = estimated_points
    if priority is not None:
        updates["priority"] = priority.value
    if ticket_type is not None:
        updates["ticket_type"] = ticket_type.value
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [ticket_id]
    with _conn() as db:
        db.execute(f"UPDATE tickets SET {set_clause} WHERE id = ?", values)
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if row is None:
        raise KeyError(f"Ticket {ticket_id} not found")
    return _row_ticket(row)


def clear_commits(project_id: str) -> None:
    with _conn() as db:
        db.execute("DELETE FROM git_commits WHERE project_id = ?", (project_id,))


def replace_commits(project_id: str, commits: list[dict[str, Any]]) -> int:
    with _conn() as db:
        db.execute("DELETE FROM git_commits WHERE project_id = ?", (project_id,))
        inserted = 0
        for commit in commits:
            db.execute(
                """
                INSERT INTO git_commits
                (id, project_id, sha, message, author, author_email, committed_at,
                 files_changed_json, additions, deletions, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _new_id(),
                    project_id,
                    commit["sha"],
                    commit["message"],
                    commit["author"],
                    commit.get("author_email", ""),
                    commit["committed_at"],
                    json.dumps(commit.get("files_changed", [])),
                    commit.get("additions", 0),
                    commit.get("deletions", 0),
                    commit.get("url"),
                ),
            )
            inserted += 1
        db.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (_now().isoformat(), project_id),
        )
    return inserted


def upsert_commits(project_id: str, commits: list[dict[str, Any]]) -> int:
    inserted = 0
    with _conn() as db:
        for commit in commits:
            try:
                db.execute(
                    """
                    INSERT INTO git_commits
                    (id, project_id, sha, message, author, author_email, committed_at,
                     files_changed_json, additions, deletions, url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        _new_id(),
                        project_id,
                        commit["sha"],
                        commit["message"],
                        commit["author"],
                        commit.get("author_email", ""),
                        commit["committed_at"],
                        json.dumps(commit.get("files_changed", [])),
                        commit.get("additions", 0),
                        commit.get("deletions", 0),
                        commit.get("url"),
                    ),
                )
                inserted += 1
            except sqlite3.IntegrityError:
                pass
        db.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (_now().isoformat(), project_id),
        )
    return inserted


def list_commits(project_id: str, limit: int = 50) -> list[GitCommitResponse]:
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM git_commits WHERE project_id = ? ORDER BY committed_at DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
    return [_row_commit(r) for r in rows]


def save_drift_analysis(
    project_id: str,
    alignment_score: int,
    findings: list[DriftFinding],
) -> list[DriftAlertResponse]:
    now = _now().isoformat()
    with _conn() as db:
        db.execute(
            "UPDATE projects SET alignment_score = ?, updated_at = ? WHERE id = ?",
            (alignment_score, now, project_id),
        )
        db.execute(
            "UPDATE drift_alerts SET resolved = 1 WHERE project_id = ? AND resolved = 0",
            (project_id,),
        )
        alerts: list[DriftAlertResponse] = []
        for finding in findings:
            alert_id = _new_id()
            db.execute(
                """
                INSERT INTO drift_alerts
                (id, project_id, severity, title, description, spec_reference,
                 code_evidence, recommendation, affected_tickets_json, alignment_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert_id,
                    project_id,
                    finding.severity.value,
                    finding.title,
                    finding.description,
                    finding.spec_reference,
                    finding.code_evidence,
                    finding.recommendation,
                    json.dumps(finding.affected_tickets),
                    alignment_score,
                    now,
                ),
            )
            row = db.execute("SELECT * FROM drift_alerts WHERE id = ?", (alert_id,)).fetchone()
            alerts.append(_row_drift(row))
    return alerts


def resolve_drift_alert(alert_id: str) -> DriftAlertResponse:
    with _conn() as db:
        db.execute("UPDATE drift_alerts SET resolved = 1 WHERE id = ?", (alert_id,))
        row = db.execute("SELECT * FROM drift_alerts WHERE id = ?", (alert_id,)).fetchone()
    if row is None:
        raise KeyError(f"Drift alert {alert_id} not found")
    return _row_drift(row)


def save_ai_insight(project_id: str, insight_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    insight_id = _new_id()
    now = _now().isoformat()
    with _conn() as db:
        db.execute(
            """
            INSERT INTO ai_insights (id, project_id, insight_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (insight_id, project_id, insight_type, json.dumps(payload), now),
        )
        db.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
    return {"id": insight_id, "insight_type": insight_type, "payload": payload, "created_at": now}


def get_latest_insight(project_id: str, insight_type: str) -> dict[str, Any] | None:
    with _conn() as db:
        row = db.execute(
            """
            SELECT * FROM ai_insights
            WHERE project_id = ? AND insight_type = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (project_id, insight_type),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "insight_type": row["insight_type"],
        "payload": json.loads(row["payload_json"]),
        "created_at": row["created_at"],
    }


def get_command_center_insights(project_id: str) -> dict[str, dict[str, Any] | None]:
    types = ("standup", "sprint_plan", "readiness", "scope_creep", "commit_links")
    return {t: get_latest_insight(project_id, t) for t in types}


_INSIGHT_ACTIVITY_LABELS: dict[str, str] = {
    "standup": "Standup digest generated",
    "sprint_plan": "Sprint plan generated",
    "readiness": "Release readiness assessed",
    "scope_creep": "Scope creep scan completed",
    "commit_links": "Commits linked to tickets",
}


def log_activity(project_id: str, event_type: str, message: str) -> None:
    now = _now().isoformat()
    with _conn() as db:
        db.execute(
            """
            INSERT INTO activity_events (id, project_id, event_type, message, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (_new_id(), project_id, event_type, message.strip(), now),
        )
        db.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )


def _derived_activity_events(project_id: str, limit: int = 12) -> list[dict[str, Any]]:
    """Backfill feed from insights and alerts when explicit events are sparse."""
    events: list[dict[str, Any]] = []
    with _conn() as db:
        insight_rows = db.execute(
            """
            SELECT id, insight_type, created_at FROM ai_insights
            WHERE project_id = ?
            ORDER BY created_at DESC LIMIT ?
            """,
            (project_id, limit),
        ).fetchall()
        for row in insight_rows:
            label = _INSIGHT_ACTIVITY_LABELS.get(row["insight_type"], row["insight_type"])
            events.append(
                {
                    "id": f"insight-{row['id']}",
                    "event_type": row["insight_type"],
                    "message": label,
                    "created_at": row["created_at"],
                }
            )

        drift_rows = db.execute(
            """
            SELECT id, title, created_at FROM drift_alerts
            WHERE project_id = ?
            ORDER BY created_at DESC LIMIT 5
            """,
            (project_id,),
        ).fetchall()
        for row in drift_rows:
            events.append(
                {
                    "id": f"drift-{row['id']}",
                    "event_type": "drift_alert",
                    "message": f"Drift alert: {row['title']}",
                    "created_at": row["created_at"],
                }
            )

        commit_row = db.execute(
            """
            SELECT COUNT(*) AS n, MAX(committed_at) AS latest
            FROM git_commits WHERE project_id = ?
            """,
            (project_id,),
        ).fetchone()
        if commit_row and commit_row["n"] and commit_row["latest"]:
            events.append(
                {
                    "id": f"git-{commit_row['latest']}",
                    "event_type": "git_sync",
                    "message": f"{commit_row['n']} commits tracked",
                    "created_at": commit_row["latest"],
                }
            )
    return events


def list_project_activity(project_id: str, limit: int = 15) -> list[dict[str, Any]]:
    with _conn() as db:
        rows = db.execute(
            """
            SELECT id, event_type, message, created_at FROM activity_events
            WHERE project_id = ?
            ORDER BY created_at DESC LIMIT ?
            """,
            (project_id, limit),
        ).fetchall()

    events = [
        {
            "id": row["id"],
            "event_type": row["event_type"],
            "message": row["message"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]

    if len(events) < limit:
        seen = {e["id"] for e in events}
        for derived in _derived_activity_events(project_id, limit=limit):
            if derived["id"] not in seen:
                events.append(derived)
                seen.add(derived["id"])

    events.sort(key=lambda e: e["created_at"], reverse=True)
    return events[:limit]

