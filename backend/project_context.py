"""Build project context strings for AI agents."""

from __future__ import annotations

from agents import format_spec_for_drift, format_tickets_for_drift


def format_commits(commits) -> str:
    if not commits:
        return "No commits synced."
    lines = []
    for c in commits[:30]:
        files = ", ".join(c.files_changed[:6]) if c.files_changed else "—"
        lines.append(
            f"- [{c.sha}] {c.message} | {c.author} | {c.committed_at} | "
            f"+{c.additions}/-{c.deletions} | files: {files}"
        )
    return "\n".join(lines)


def format_drift_alerts(alerts) -> str:
    open_alerts = [a for a in alerts if not a.resolved]
    if not open_alerts:
        return "No open drift alerts."
    lines = []
    for a in open_alerts[:15]:
        lines.append(f"- [{a.severity.value}] {a.title}: {a.description}")
    return "\n".join(lines)


def build_project_context(project) -> str:
    spec_text = format_spec_for_drift(project.spec) if project.spec else "No spec yet."
    tickets_text = format_tickets_for_drift(project.tickets)
    commits_text = format_commits(project.recent_commits)
    drift_text = format_drift_alerts(project.drift_alerts)
    done = sum(1 for t in project.tickets if t.status.value == "done")
    in_prog = sum(1 for t in project.tickets if t.status.value == "in_progress")
    blocked = sum(1 for t in project.tickets if t.status.value == "blocked")
    total_pts = sum(t.estimated_points or 0 for t in project.tickets)

    return f"""PROJECT: {project.name}
Branch: {project.repo_branch}
Alignment score: {project.alignment_score if project.alignment_score is not None else 'not checked'}
Tickets: {len(project.tickets)} total | {done} done | {in_prog} in progress | {blocked} blocked
Story points total: {total_pts}

=== SPEC ===
{spec_text}

=== TICKETS ===
{tickets_text}

=== GIT COMMITS ===
{commits_text}

=== DRIFT ALERTS ===
{drift_text}
"""


def build_standup_context(project) -> str:
    """Compact context to reduce Gemini truncation on standup output."""
    blocked = [t for t in project.tickets if t.status.value == "blocked"]
    in_prog = [t for t in project.tickets if t.status.value == "in_progress"]
    done = [t for t in project.tickets if t.status.value == "done"]
    backlog = [t for t in project.tickets if t.status.value == "backlog"]

    spec_title = project.spec.title if project.spec else project.name
    overview = project.spec.overview if project.spec else ""
    if len(overview) > 400:
        overview = overview[:400] + "..."

    commits_lines = [
        f"- [{c.sha}] {c.message} by {c.author}" for c in project.recent_commits[:12]
    ]
    drift_lines = [
        f"- [{a.severity.value}] {a.title}"
        for a in project.drift_alerts
        if not a.resolved
    ]

    def ticket_lines(tickets, limit=8):
        lines = []
        for t in tickets[:limit]:
            line = f"- [{t.status.value}] {t.title}"
            if t.dependencies:
                line += f" (depends on: {', '.join(t.dependencies[:2])})"
            lines.append(line)
        return lines

    return f"""PROJECT: {project.name}
Branch: {project.repo_branch}
Alignment: {project.alignment_score if project.alignment_score is not None else 'n/a'}%
Spec: {spec_title}
Overview: {overview}

BLOCKED ({len(blocked)}):
{chr(10).join(ticket_lines(blocked)) or 'None'}

IN PROGRESS ({len(in_prog)}):
{chr(10).join(ticket_lines(in_prog)) or 'None'}

DONE ({len(done)}):
{chr(10).join(ticket_lines(done, 5)) or 'None'}

BACKLOG (top 8):
{chr(10).join(ticket_lines(backlog)) or 'None'}

RECENT COMMITS:
{chr(10).join(commits_lines) or 'None'}

OPEN DRIFT:
{chr(10).join(drift_lines) or 'None'}
"""
