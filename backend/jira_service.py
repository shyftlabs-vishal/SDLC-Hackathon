"""JIRA Cloud integration — push tickets and sync status."""

from __future__ import annotations

import os
import re
import uuid
from typing import Any

import httpx

from schemas import TicketPriority, TicketResponse, TicketStatus, TicketType

ISSUE_TYPE_MAP: dict[TicketType, str] = {
    TicketType.FEATURE: "Story",
    TicketType.BUG: "Bug",
    TicketType.TASK: "Task",
    TicketType.SPIKE: "Spike",
    TicketType.CHORE: "Task",
}

PRIORITY_MAP: dict[TicketPriority, str] = {
    TicketPriority.CRITICAL: "Highest",
    TicketPriority.HIGH: "High",
    TicketPriority.MEDIUM: "Medium",
    TicketPriority.LOW: "Low",
}

JIRA_PRIORITY_MAP: dict[str, TicketPriority] = {
    "highest": TicketPriority.CRITICAL,
    "high": TicketPriority.HIGH,
    "medium": TicketPriority.MEDIUM,
    "low": TicketPriority.LOW,
    "lowest": TicketPriority.LOW,
}

JIRA_TYPE_MAP: dict[str, TicketType] = {
    "story": TicketType.FEATURE,
    "bug": TicketType.BUG,
    "task": TicketType.TASK,
    "spike": TicketType.SPIKE,
    "sub-task": TicketType.CHORE,
    "subtask": TicketType.CHORE,
    "epic": TicketType.FEATURE,
}

STATUS_FROM_JIRA: list[tuple[re.Pattern[str], TicketStatus]] = [
    (re.compile(r"done|closed|resolved|complete", re.I), TicketStatus.DONE),
    (re.compile(r"block|imped", re.I), TicketStatus.BLOCKED),
    (re.compile(r"review", re.I), TicketStatus.IN_REVIEW),
    (re.compile(r"progress|develop|active", re.I), TicketStatus.IN_PROGRESS),
    (re.compile(r"backlog|todo|open|new|selected", re.I), TicketStatus.BACKLOG),
]

STATUS_TO_JIRA_HINTS: dict[TicketStatus, list[str]] = {
    TicketStatus.BACKLOG: ["backlog", "to do", "todo", "open", "new"],
    TicketStatus.IN_PROGRESS: ["in progress", "progress", "develop", "active"],
    TicketStatus.IN_REVIEW: ["in review", "review", "code review"],
    TicketStatus.DONE: ["done", "closed", "resolved", "complete"],
    TicketStatus.BLOCKED: ["blocked", "impediment", "on hold"],
}


def normalize_site_url(url: str | None) -> str:
    raw = (url or os.getenv("JIRA_SITE_URL", "")).strip().rstrip("/")
    if not raw:
        return ""
    if not raw.startswith("http"):
        if ".atlassian.net" in raw:
            raw = f"https://{raw}"
        else:
            raw = f"https://{raw}.atlassian.net"
    return raw


def is_configured(site_url: str | None = None) -> bool:
    site = normalize_site_url(site_url)
    return bool(site and os.getenv("JIRA_EMAIL") and os.getenv("JIRA_API_TOKEN"))


def _auth() -> tuple[str, str]:
    email = os.getenv("JIRA_EMAIL", "").strip()
    token = os.getenv("JIRA_API_TOKEN", "").strip()
    if not email or not token:
        raise ValueError("Set JIRA_EMAIL and JIRA_API_TOKEN in backend/.env")
    return email, token


def _client(site_url: str) -> httpx.AsyncClient:
    site = normalize_site_url(site_url)
    if not site:
        raise ValueError("JIRA site URL is not configured")
    return httpx.AsyncClient(
        base_url=f"{site}/rest/api/3",
        auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=45.0,
    )


def text_to_adf(text: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    for line in text.splitlines() or [text]:
        line = line.strip()
        if line:
            content.append(
                {"type": "paragraph", "content": [{"type": "text", "text": line}]}
            )
    if not content:
        content = [{"type": "paragraph", "content": [{"type": "text", "text": " "}]}]
    return {"type": "doc", "version": 1, "content": content}


def map_jira_status(jira_status: str) -> TicketStatus:
    for pattern, status in STATUS_FROM_JIRA:
        if pattern.search(jira_status):
            return status
    return TicketStatus.BACKLOG


def adf_to_text(node: Any) -> str:
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if node.get("type") == "text":
            return str(node.get("text", ""))
        parts = [adf_to_text(child) for child in node.get("content") or []]
        text = "".join(parts)
        if node.get("type") in ("paragraph", "heading"):
            text += "\n"
        return text
    if isinstance(node, list):
        return "".join(adf_to_text(item) for item in node)
    return ""


def map_jira_priority(name: str | None) -> TicketPriority:
    if not name:
        return TicketPriority.MEDIUM
    key = name.strip().lower()
    if key in JIRA_PRIORITY_MAP:
        return JIRA_PRIORITY_MAP[key]
    if any(w in key for w in ("highest", "critical", "blocker", "p0", "p1")):
        return TicketPriority.CRITICAL
    if "high" in key or key in ("p2",):
        return TicketPriority.HIGH
    if "lowest" in key or "minor" in key or "trivial" in key or key in ("p4", "p5"):
        return TicketPriority.LOW
    if "low" in key or key == "p3":
        return TicketPriority.LOW
    if "medium" in key or "normal" in key:
        return TicketPriority.MEDIUM
    return TicketPriority.MEDIUM


def map_jira_issue_type(name: str | None) -> TicketType:
    if not name:
        return TicketType.TASK
    return JIRA_TYPE_MAP.get(name.lower(), TicketType.TASK)


def parse_jira_assignee(fields: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return (display name, account id) from JIRA issue fields."""
    raw = fields.get("assignee")
    if not raw or not isinstance(raw, dict):
        return None, None
    name = raw.get("displayName") or raw.get("emailAddress")
    account_id = raw.get("accountId")
    return (str(name).strip() if name else None), (str(account_id) if account_id else None)


def parse_imported_issue(issue: dict[str, Any], site_url: str) -> dict[str, Any]:
    fields = issue.get("fields") or {}
    description_raw = fields.get("description")
    if isinstance(description_raw, dict):
        description = adf_to_text(description_raw).strip()
    else:
        description = str(description_raw or "").strip()
    key = issue["key"]
    assignee_name, assignee_account_id = parse_jira_assignee(fields)
    return {
        "issue_key": key,
        "issue_id": str(issue["id"]),
        "url": f"{normalize_site_url(site_url)}/browse/{key}",
        "title": str(fields.get("summary") or key),
        "description": description or f"Imported from JIRA issue {key}",
        "status": map_jira_status(str((fields.get("status") or {}).get("name", ""))),
        "priority": map_jira_priority(str((fields.get("priority") or {}).get("name", ""))),
        "ticket_type": map_jira_issue_type(str((fields.get("issuetype") or {}).get("name", ""))),
        "assignee": assignee_name,
        "jira_assignee_account_id": assignee_account_id,
    }


def _build_description(ticket: TicketResponse) -> dict[str, Any]:
    parts = [ticket.description]
    if ticket.acceptance_criteria:
        parts.append("\nAcceptance criteria:")
        parts.extend(f"- {item}" for item in ticket.acceptance_criteria)
    if ticket.dependencies:
        parts.append("\nDependencies:")
        parts.extend(f"- {dep}" for dep in ticket.dependencies)
    if ticket.estimated_points is not None:
        parts.append(f"\nStory points: {ticket.estimated_points}")
    parts.append(f"\n---\nSynced from SDLC Conductor (ticket {ticket.id})")
    return text_to_adf("\n".join(parts))


_ISSUE_FIELDS = "status,summary,priority,issuetype,assignee"


def _issue_type_name(ticket: TicketResponse) -> str:
    return ISSUE_TYPE_MAP.get(ticket.ticket_type, "Task")


async def verify_connection(site_url: str) -> dict[str, Any]:
    async with _client(site_url) as client:
        resp = await client.get("/myself")
        if resp.status_code == 401:
            raise ValueError("JIRA authentication failed — check JIRA_EMAIL and JIRA_API_TOKEN")
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA API error ({resp.status_code}): {resp.text[:200]}")
        return resp.json()


async def verify_project(site_url: str, project_key: str) -> dict[str, Any]:
    async with _client(site_url) as client:
        resp = await client.get(f"/project/{project_key}")
        if resp.status_code == 404:
            raise ValueError(f"JIRA project '{project_key}' not found")
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA API error ({resp.status_code}): {resp.text[:200]}")
        return resp.json()


async def create_issue(
    site_url: str,
    project_key: str,
    ticket: TicketResponse,
) -> dict[str, str]:
    fields: dict[str, Any] = {
        "project": {"key": project_key},
        "summary": ticket.title[:255],
        "description": _build_description(ticket),
        "issuetype": {"name": _issue_type_name(ticket)},
        "priority": {"name": PRIORITY_MAP.get(ticket.priority, "Medium")},
    }
    if ticket.jira_assignee_account_id:
        fields["assignee"] = {"accountId": ticket.jira_assignee_account_id}

    async with _client(site_url) as client:
        resp = await client.post("/issue", json={"fields": fields})
        if resp.status_code == 400:
            # Retry with Task if Story/Spike not available on project
            err = resp.text.lower()
            if "issuetype" in err or "issue type" in err:
                fields["issuetype"] = {"name": "Task"}
                resp = await client.post("/issue", json={"fields": fields})
        if resp.status_code not in (200, 201):
            raise RuntimeError(
                f"Failed to create JIRA issue for '{ticket.title}': "
                f"{resp.status_code} {resp.text[:300]}"
            )
        data = resp.json()
        key = data["key"]
        issue_id = str(data["id"])
        url = f"{normalize_site_url(site_url)}/browse/{key}"
        return {"issue_key": key, "issue_id": issue_id, "url": url}


async def get_issue(site_url: str, issue_key: str) -> dict[str, Any]:
    async with _client(site_url) as client:
        resp = await client.get(
            f"/issue/{issue_key}",
            params={"fields": _ISSUE_FIELDS},
        )
        if resp.status_code == 404:
            raise ValueError(f"JIRA issue {issue_key} not found")
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA API error ({resp.status_code}): {resp.text[:200]}")
        return resp.json()


async def update_issue_summary(
    site_url: str,
    issue_key: str,
    summary: str,
) -> bool:
    async with _client(site_url) as client:
        resp = await client.put(
            f"/issue/{issue_key}",
            json={"fields": {"summary": summary[:255]}},
        )
        return resp.status_code in (200, 204)


async def update_issue_priority(
    site_url: str,
    issue_key: str,
    priority: TicketPriority,
) -> bool:
    async with _client(site_url) as client:
        resp = await client.put(
            f"/issue/{issue_key}",
            json={"fields": {"priority": {"name": PRIORITY_MAP.get(priority, "Medium")}}},
        )
        if resp.status_code in (200, 204):
            return True
        # Retry alternate JIRA priority labels (some sites use "Highest" vs "Critical")
        if priority == TicketPriority.CRITICAL:
            resp = await client.put(
                f"/issue/{issue_key}",
                json={"fields": {"priority": {"name": "High"}}},
            )
        return resp.status_code in (200, 204)


async def update_issue_assignee(
    site_url: str,
    issue_key: str,
    account_id: str | None,
) -> bool:
    """Set or clear JIRA assignee by account id."""
    payload = {"accountId": account_id} if account_id else None
    async with _client(site_url) as client:
        resp = await client.put(
            f"/issue/{issue_key}",
            json={"fields": {"assignee": payload}},
        )
        return resp.status_code in (200, 204)


async def transition_issue(site_url: str, issue_key: str, target_status: TicketStatus) -> bool:
    hints = STATUS_TO_JIRA_HINTS.get(target_status, [])
    async with _client(site_url) as client:
        resp = await client.get(f"/issue/{issue_key}/transitions")
        if resp.status_code >= 400:
            return False
        transitions = resp.json().get("transitions", [])
        chosen = None
        for transition in transitions:
            name = str(transition.get("to", {}).get("name", "")).lower()
            label = str(transition.get("name", "")).lower()
            if any(h in name or h in label for h in hints):
                chosen = transition
                break
        if chosen is None:
            return False
        move = await client.post(
            f"/issue/{issue_key}/transitions",
            json={"transition": {"id": chosen["id"]}},
        )
        return move.status_code in (200, 204)


async def push_tickets(
    site_url: str,
    project_key: str,
    tickets: list[TicketResponse],
) -> tuple[list[dict[str, str]], list[str]]:
    created: list[dict[str, str]] = []
    errors: list[str] = []
    for ticket in tickets:
        if ticket.jira_issue_key:
            continue
        try:
            result = await create_issue(site_url, project_key, ticket)
            created.append({"ticket_id": ticket.id, **result})
        except Exception as exc:
            errors.append(f"{ticket.title}: {exc}")
    return created, errors


async def sync_tickets_from_jira(
    site_url: str,
    tickets: list[TicketResponse],
) -> tuple[list[dict[str, str]], list[str]]:
    """Pull status, priority, and assignee from JIRA for linked tickets."""
    updated: list[dict[str, str]] = []
    errors: list[str] = []
    for ticket in tickets:
        if not ticket.jira_issue_key:
            continue
        try:
            issue = await get_issue(site_url, ticket.jira_issue_key)
            fields = issue.get("fields") or {}
            jira_status = str((fields.get("status") or {}).get("name", ""))
            jira_priority = str((fields.get("priority") or {}).get("name", ""))
            local_status = map_jira_status(jira_status)
            local_priority = map_jira_priority(jira_priority)
            local_assignee, local_account_id = parse_jira_assignee(fields)
            updated.append(
                {
                    "ticket_id": ticket.id,
                    "issue_key": ticket.jira_issue_key,
                    "jira_status": jira_status,
                    "local_status": local_status.value,
                    "jira_priority": jira_priority,
                    "local_priority": local_priority.value,
                    "jira_assignee": local_assignee or "",
                    "local_assignee": local_assignee,
                    "local_assignee_account_id": local_account_id,
                }
            )
        except Exception as exc:
            errors.append(f"{ticket.jira_issue_key}: {exc}")
    return updated, errors


# Backwards-compatible alias
sync_ticket_statuses = sync_tickets_from_jira


async def list_project_issues(
    site_url: str,
    project_key: str,
    max_results: int = 100,
) -> list[dict[str, Any]]:
    jql = f'project = "{project_key}" ORDER BY created DESC'
    async with _client(site_url) as client:
        resp = await client.post(
            "/search/jql",
            json={
                "jql": jql,
                "maxResults": max_results,
                "fields": ["summary", "description", "status", "issuetype", "priority", "assignee"],
            },
        )
        if resp.status_code == 404:
            resp = await client.post(
                "/search",
                json={
                    "jql": jql,
                    "maxResults": max_results,
                    "fields": ["summary", "description", "status", "issuetype", "priority", "assignee"],
                },
            )
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA search failed ({resp.status_code}): {resp.text[:300]}")
        data = resp.json()
        return data.get("issues") or []


async def fetch_issues_to_import(
    site_url: str,
    project_key: str,
    known_issue_keys: set[str],
    max_results: int = 100,
) -> tuple[list[dict[str, Any]], int]:
    issues = await list_project_issues(site_url, project_key, max_results)
    to_import: list[dict[str, Any]] = []
    skipped = 0
    for issue in issues:
        key = issue.get("key")
        if not key or key in known_issue_keys:
            skipped += 1
            continue
        to_import.append(parse_imported_issue(issue, site_url))
    return to_import, skipped


async def get_jira_user(site_url: str, account_id: str) -> dict[str, Any]:
    async with _client(site_url) as client:
        resp = await client.get("/user", params={"accountId": account_id})
        if resp.status_code == 404:
            raise ValueError("JIRA user not found")
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA API error ({resp.status_code}): {resp.text[:200]}")
        return resp.json()


async def search_jira_user(site_url: str, query: str) -> dict[str, Any]:
    query = query.strip()
    if not query:
        raise ValueError("Recipient email is required")
    async with _client(site_url) as client:
        resp = await client.get("/user/search", params={"query": query, "maxResults": 10})
        if resp.status_code >= 400:
            raise RuntimeError(f"JIRA user search failed ({resp.status_code}): {resp.text[:200]}")
        users = resp.json() or []
        if not users:
            raise ValueError(f"No JIRA user found for '{query}'")
        lowered = query.lower()
        for user in users:
            email = str(user.get("emailAddress") or "").lower()
            if email == lowered:
                return user
        return users[0]


def comment_with_mention_adf(message: str, account_id: str, display_name: str) -> dict[str, Any]:
    text = message.strip() or "Could you please take a look at this ticket?"
    mention = {
        "type": "mention",
        "attrs": {
            "id": account_id,
            "text": f"@{display_name}",
            "accessLevel": "",
            "localId": str(uuid.uuid4()),
        },
    }
    content: list[dict[str, Any]] = []
    lines = text.splitlines() or [text]
    for index, line in enumerate(lines):
        line = line.strip()
        if not line and index > 0:
            continue
        para: list[dict[str, Any]] = []
        if index == 0:
            para.append(mention)
            para.append({"type": "text", "text": f" {line}" if line else " — heads up on this ticket."})
        else:
            para.append({"type": "text", "text": line})
        content.append({"type": "paragraph", "content": para})
    return {"type": "doc", "version": 1, "content": content}


async def add_issue_comment(site_url: str, issue_key: str, body_adf: dict[str, Any]) -> dict[str, Any]:
    async with _client(site_url) as client:
        resp = await client.post(f"/issue/{issue_key}/comment", json={"body": body_adf})
        if resp.status_code not in (200, 201):
            raise RuntimeError(
                f"Failed to add JIRA comment on {issue_key}: {resp.status_code} {resp.text[:300]}"
            )
        return resp.json()


async def nudge_user_on_issue(
    site_url: str,
    issue_key: str,
    *,
    recipient_email: str | None = None,
    recipient_account_id: str | None = None,
    message: str = "",
) -> dict[str, Any]:
    """Post a JIRA comment that @mentions a user — JIRA emails them automatically."""
    if recipient_account_id:
        user = await get_jira_user(site_url, recipient_account_id)
    elif recipient_email:
        user = await search_jira_user(site_url, recipient_email)
    else:
        raise ValueError("Provide recipient_email or recipient_account_id")

    account_id = str(user["accountId"])
    display_name = str(user.get("displayName") or "there")
    adf = comment_with_mention_adf(message, account_id, display_name)
    comment = await add_issue_comment(site_url, issue_key, adf)
    return {
        "issue_key": issue_key,
        "recipient_name": display_name,
        "recipient_email": user.get("emailAddress"),
        "comment_id": str(comment.get("id", "")),
        "comment_url": f"{normalize_site_url(site_url)}/browse/{issue_key}?focusedCommentId={comment.get('id')}",
    }
