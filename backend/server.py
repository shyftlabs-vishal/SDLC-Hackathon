#!/usr/bin/env python3
"""
SDLC Conductor API server.

Usage:
  cd sdlc-conductor/backend
  ./start.sh
  # or: source .venv/bin/activate && python server.py

API: http://localhost:8096
Frontend: cd ../frontend && npm run dev
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from document_parser import DocumentParseError, extract_text_from_bytes

load_dotenv(ROOT / ".env")


def _ensure_dependencies() -> None:
    try:
        import pydantic_settings  # noqa: F401
    except ImportError:
        venv_python = ROOT / ".venv" / "bin" / "python"
        print("Missing Python dependencies.", file=sys.stderr)
        print("Use the project virtualenv:", file=sys.stderr)
        print("  source .venv/bin/activate && python server.py", file=sys.stderr)
        if venv_python.exists():
            print("  ./start.sh", file=sys.stderr)
        else:
            print("Create it first: python3.13 -m venv .venv && pip install -r requirements.txt", file=sys.stderr)
        sys.exit(1)


_ensure_dependencies()

import uvicorn
from agents import (
    analyze_requirement,
    detect_drift,
    format_spec_for_drift,
    format_tickets_for_drift,
    map_llm_error,
)
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from git_service import (
    build_activity_summary,
    list_project_branches,
    normalize_commit_timestamps,
    sync_project_commits,
)
from jira_service import (
    fetch_issues_to_import as jira_fetch_issues_to_import,
    is_configured as jira_is_configured,
    normalize_site_url,
    nudge_user_on_issue as jira_nudge_user_on_issue,
    push_tickets as jira_push_tickets,
    sync_tickets_from_jira as jira_sync_tickets,
    transition_issue as jira_transition_issue,
    update_issue_assignee as jira_update_issue_assignee,
    update_issue_description as jira_update_issue_description,
    update_issue_priority as jira_update_issue_priority,
    update_issue_summary as jira_update_issue_summary,
    verify_connection as jira_verify_connection,
    verify_project as jira_verify_project,
)
from ai_agents import (
    ask_project,
    assess_release_readiness,
    detect_scope_creep,
    enrich_tickets,
    generate_sprint_plan,
    generate_standup_for_project,
    link_commits_to_tickets,
    run_magic_suite,
)
from llm_config import api_key_env_name, is_api_key_configured, llm_status
from project_context import build_project_context
from schemas import (
    AnalyzeResponse,
    ApplyCommitLinksResponse,
    CommandCenterResponse,
    CommitLinkResponse,
    CommitLinkResult,
    DriftCheckResponse,
    DocumentExtractResponse,
    GitBranchesResponse,
    GitSyncRequest,
    GitSyncResponse,
    HealthResponse,
    JiraConfigRequest,
    JiraImportRequest,
    JiraImportResponse,
    JiraNudgeRequest,
    JiraNudgeResponse,
    JiraPushResponse,
    JiraStatusResponse,
    JiraSyncResponse,
    MagicRunResponse,
    ProjectActivityResponse,
    ProjectChatRequest,
    ProjectChatResult,
    ProjectCreate,
    ProjectDetail,
    ProjectSummary,
    ProjectUpdate,
    ReleaseReadinessResult,
    RequirementInput,
    ScopeCreepResult,
    SprintPlanRequest,
    SprintPlanResult,
    StandupDigestResult,
    TicketResponse,
    TicketUpdate,
)
from store import (
    create_project,
    delete_project,
    delete_ticket,
    enrich_ticket_fields,
    find_ticket_by_title,
    get_command_center_insights,
    get_latest_insight,
    get_project_detail,
    get_ticket,
    import_ticket_from_jira,
    init_db,
    link_ticket_jira,
    list_jira_issue_keys,
    list_project_activity,
    list_projects,
    log_activity,
    replace_commits,
    resolve_drift_alert,
    save_ai_insight,
    save_analysis,
    save_drift_analysis,
    update_project,
    update_ticket,
)

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]

app = FastAPI(
    title="SDLC Conductor",
    description="Turn requirements into specs + tickets, track git activity, detect drift",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    init_db()


def _require_llm() -> None:
    if not is_api_key_configured():
        key = api_key_env_name()
        raise HTTPException(status_code=503, detail=f"{key} is not set.")


def _get_project_or_404(project_id: str) -> ProjectDetail:
    try:
        return get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _activity(project_id: str, event_type: str, message: str) -> None:
    try:
        log_activity(project_id, event_type, message)
    except Exception:
        pass


async def _run_ai(coro):
    try:
        return await coro
    except Exception as exc:
        mapped = map_llm_error(exc)
        if mapped:
            status, detail = mapped
            raise HTTPException(status_code=status, detail=detail) from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    status = llm_status()
    return HealthResponse(
        status="ok",
        service="SDLC Conductor",
        github_configured=bool(os.getenv("GITHUB_TOKEN")),
        jira_configured=jira_is_configured(),
        **status,
    )


@app.get("/api/projects", response_model=list[ProjectSummary])
async def get_projects() -> list[ProjectSummary]:
    return list_projects()


@app.post("/api/projects", response_model=ProjectDetail, status_code=201)
async def post_project(body: ProjectCreate) -> ProjectDetail:
    summary = create_project(
        name=body.name,
        description=body.description,
        requirement=body.requirement,
        repo_url=body.repo_url,
        repo_branch=body.repo_branch,
        local_repo_path=body.local_repo_path,
        jira_site_url=body.jira_site_url,
        jira_project_key=body.jira_project_key,
    )
    _activity(summary.id, "project_created", f"Project “{summary.name}” created")
    if body.requirement.strip():
        try:
            analysis = await analyze_requirement(body.requirement)
            save_analysis(summary.id, body.requirement, analysis.spec, analysis.tickets)
            _activity(
                summary.id,
                "analyze",
                f"Spec and {len(analysis.tickets)} tickets generated",
            )
        except Exception as exc:
            mapped = map_llm_error(exc)
            if mapped:
                status, detail = mapped
                raise HTTPException(status_code=status, detail=detail) from exc
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    return get_project_detail(summary.id)


@app.get("/api/projects/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: str) -> ProjectDetail:
    try:
        return get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}/activity", response_model=ProjectActivityResponse)
async def get_project_activity(project_id: str, limit: int = 15) -> ProjectActivityResponse:
    _get_project_or_404(project_id)
    return ProjectActivityResponse(events=list_project_activity(project_id, limit=min(limit, 30)))


@app.patch("/api/projects/{project_id}", response_model=ProjectSummary)
async def patch_project(project_id: str, body: ProjectUpdate) -> ProjectSummary:
    try:
        return update_project(
            project_id,
            **body.model_dump(exclude_unset=True),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/projects/{project_id}", status_code=204)
async def remove_project(project_id: str) -> None:
    try:
        delete_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/documents/extract-text", response_model=DocumentExtractResponse)
async def extract_document_text(file: UploadFile = File(...)) -> DocumentExtractResponse:
    """Parse an uploaded document and return extracted text only (file is not stored)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    data = await file.read()
    try:
        result = extract_text_from_bytes(
            data,
            file.filename,
            content_type=file.content_type,
        )
        return DocumentExtractResponse(**result)
    except DocumentParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/analyze", response_model=AnalyzeResponse)
async def analyze_project_requirement(project_id: str, body: RequirementInput) -> AnalyzeResponse:
    if not is_api_key_configured():
        key = api_key_env_name()
        raise HTTPException(status_code=503, detail=f"{key} is not set.")

    try:
        get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        analysis = await analyze_requirement(body.requirement)
        spec, tickets = save_analysis(
            project_id,
            body.requirement,
            analysis.spec,
            analysis.tickets,
        )
        _activity(project_id, "analyze", f"Spec and {len(tickets)} tickets generated")
        return AnalyzeResponse(spec=spec, tickets=tickets, summary=analysis.summary)
    except Exception as exc:
        mapped = map_llm_error(exc)
        if mapped:
            status, detail = mapped
            raise HTTPException(status_code=status, detail=detail) from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.patch("/api/tickets/{ticket_id}", response_model=TicketResponse)
async def patch_ticket(ticket_id: str, body: TicketUpdate) -> TicketResponse:
    try:
        ticket_before = get_ticket(ticket_id)
        assignee_changed = (
            "assignee" in body.model_fields_set
            or "jira_assignee_account_id" in body.model_fields_set
        ) and (
            body.assignee != ticket_before.assignee
            or body.jira_assignee_account_id != ticket_before.jira_assignee_account_id
        )
        title_changed = (
            "title" in body.model_fields_set
            and body.title is not None
            and body.title.strip() != ticket_before.title
        )
        description_changed = (
            "description" in body.model_fields_set
            and body.description is not None
            and body.description.strip() != ticket_before.description
        )
        points_changed = (
            "estimated_points" in body.model_fields_set
            and body.estimated_points != ticket_before.estimated_points
        )
        normalized_criteria = (
            [item.strip() for item in body.acceptance_criteria if item.strip()]
            if "acceptance_criteria" in body.model_fields_set
            and body.acceptance_criteria is not None
            else None
        )
        criteria_changed = (
            normalized_criteria is not None
            and normalized_criteria != ticket_before.acceptance_criteria
        )
        updated = update_ticket(
            ticket_id,
            status=body.status,
            priority=body.priority,
            title=body.title.strip() if title_changed else None,
            description=body.description.strip() if description_changed else None,
            acceptance_criteria=normalized_criteria if criteria_changed else None,
            estimated_points=body.estimated_points if points_changed else None,
            assignee=body.assignee if assignee_changed else None,
            jira_assignee_account_id=(
                body.jira_assignee_account_id if assignee_changed else None
            ),
            sync_assignee=assignee_changed,
            sync_description=description_changed,
            sync_acceptance_criteria=criteria_changed,
            sync_points=points_changed,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if ticket_before.jira_issue_key:
        project = get_project_detail(ticket_before.project_id)
        site = _jira_site_for_project(project)
        if site and jira_is_configured(site):
            if body.status is not None:
                try:
                    await jira_transition_issue(site, ticket_before.jira_issue_key, body.status)
                except Exception:
                    pass
            if body.priority is not None and body.priority != ticket_before.priority:
                try:
                    await jira_update_issue_priority(
                        site, ticket_before.jira_issue_key, body.priority
                    )
                except Exception:
                    pass
            if assignee_changed:
                try:
                    await jira_update_issue_assignee(
                        site,
                        ticket_before.jira_issue_key,
                        body.jira_assignee_account_id,
                    )
                except Exception:
                    pass
            if title_changed and body.title is not None:
                try:
                    await jira_update_issue_summary(
                        site,
                        ticket_before.jira_issue_key,
                        body.title.strip(),
                    )
                except Exception:
                    pass
            if description_changed or points_changed or criteria_changed:
                try:
                    await jira_update_issue_description(
                        site,
                        ticket_before.jira_issue_key,
                        updated,
                    )
                except Exception:
                    pass

    if title_changed and body.title is not None:
        _activity(
            ticket_before.project_id,
            "ticket_update",
            f"Ticket renamed to “{body.title.strip()}”",
        )

    if description_changed or points_changed or criteria_changed:
        _activity(
            ticket_before.project_id,
            "ticket_update",
            f"Ticket “{updated.title}” details updated",
        )

    if body.status is not None and body.status != ticket_before.status:
        _activity(
            ticket_before.project_id,
            "ticket_update",
            f"Ticket “{ticket_before.title}” → {body.status.value.replace('_', ' ')}",
        )

    return updated


@app.post("/api/tickets/{ticket_id}/jira/nudge", response_model=JiraNudgeResponse)
async def jira_nudge_ticket(ticket_id: str, body: JiraNudgeRequest) -> JiraNudgeResponse:
    try:
        ticket = get_ticket(ticket_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not ticket.jira_issue_key:
        raise HTTPException(
            status_code=400,
            detail="Ticket is not linked to JIRA. Push or import it first.",
        )

    project = get_project_detail(ticket.project_id)
    site = _jira_site_for_project(project)
    if not site or not jira_is_configured(site):
        raise HTTPException(status_code=503, detail="JIRA not configured.")

    account_id = body.recipient_account_id or ticket.jira_assignee_account_id
    email = (body.recipient_email or "").strip() or None
    if not email and not account_id:
        raise HTTPException(
            status_code=400,
            detail="Enter the recipient's Atlassian email, or assign someone on the ticket first.",
        )

    try:
        result = await jira_nudge_user_on_issue(
            site,
            ticket.jira_issue_key,
            recipient_email=email,
            recipient_account_id=account_id if not email else None,
            message=body.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    _activity(
        ticket.project_id,
        "jira_nudge",
        f"Nudged {result['recipient_name']} on {ticket.jira_issue_key}",
    )
    return JiraNudgeResponse(**result)


def _jira_site_for_project(project: ProjectDetail) -> str:
    return normalize_site_url(project.jira_site_url)


def _require_jira(project: ProjectDetail) -> tuple[str, str]:
    site = _jira_site_for_project(project)
    if not jira_is_configured(site):
        raise HTTPException(
            status_code=503,
            detail="JIRA not configured. Set JIRA_SITE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in backend/.env",
        )
    if not project.jira_project_key:
        raise HTTPException(
            status_code=400,
            detail="JIRA project key not set. Configure it on the Tickets tab.",
        )
    return site, project.jira_project_key


@app.get("/api/projects/{project_id}/jira/status", response_model=JiraStatusResponse)
async def jira_status(project_id: str) -> JiraStatusResponse:
    project = _get_project_or_404(project_id)
    site = _jira_site_for_project(project)
    configured = jira_is_configured(site)
    linked = sum(1 for t in project.tickets if t.jira_issue_key)
    user_name: str | None = None
    if configured and site:
        try:
            me = await jira_verify_connection(site)
            user_name = me.get("displayName")
        except Exception:
            pass
    return JiraStatusResponse(
        configured=configured,
        site_url=site or None,
        project_key=project.jira_project_key,
        linked_tickets=linked,
        total_tickets=len(project.tickets),
        user_display_name=user_name,
    )


@app.put("/api/projects/{project_id}/jira/config", response_model=ProjectSummary)
async def jira_config(project_id: str, body: JiraConfigRequest) -> ProjectSummary:
    try:
        summary = update_project(
            project_id,
            jira_site_url=body.jira_site_url,
            jira_project_key=body.jira_project_key,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    site = normalize_site_url(body.jira_site_url or summary.jira_site_url)
    key = body.jira_project_key or summary.jira_project_key
    if site and key and jira_is_configured(site):
        try:
            await jira_verify_connection(site)
            await jira_verify_project(site, key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return summary


@app.post("/api/projects/{project_id}/jira/push", response_model=JiraPushResponse)
async def jira_push(project_id: str) -> JiraPushResponse:
    project = _get_project_or_404(project_id)
    if not project.tickets:
        raise HTTPException(status_code=400, detail="No tickets to push.")
    site, project_key = _require_jira(project)

    try:
        created_rows, errors = await jira_push_tickets(site, project_key, project.tickets)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    for row in created_rows:
        link_ticket_jira(
            row["ticket_id"],
            row["issue_key"],
            row["issue_id"],
            row["url"],
        )

    refreshed = get_project_detail(project_id)
    skipped = sum(1 for t in project.tickets if t.jira_issue_key)
    _activity(project_id, "jira_push", f"Pushed {len(created_rows)} ticket(s) to JIRA")
    return JiraPushResponse(
        created=len(created_rows),
        skipped=skipped,
        errors=errors,
        tickets=refreshed.tickets,
    )


@app.post("/api/projects/{project_id}/jira/sync", response_model=JiraSyncResponse)
async def jira_sync(project_id: str) -> JiraSyncResponse:
    project = _get_project_or_404(project_id)
    site, _ = _require_jira(project)
    linked = [t for t in project.tickets if t.jira_issue_key]
    if not linked:
        raise HTTPException(status_code=400, detail="No tickets linked to JIRA yet. Push first.")

    try:
        updates, deleted_ids, errors = await jira_sync_tickets(site, linked)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    from schemas import TicketPriority as TicketPriorityEnum
    from schemas import TicketStatus as TicketStatusEnum

    count = 0
    for item in updates:
        ticket = get_ticket(item["ticket_id"])
        status = TicketStatusEnum(item["local_status"])
        priority = TicketPriorityEnum(item["local_priority"])
        local_assignee = item.get("local_assignee")
        local_account_id = item.get("local_assignee_account_id")
        status_changed = ticket.status != status
        priority_changed = ticket.priority != priority
        assignee_changed = (
            ticket.assignee != local_assignee
            or ticket.jira_assignee_account_id != local_account_id
        )
        if status_changed or priority_changed or assignee_changed:
            update_ticket(
                item["ticket_id"],
                status=status if status_changed else None,
                priority=priority if priority_changed else None,
                assignee=local_assignee,
                jira_assignee_account_id=local_account_id,
                sync_assignee=assignee_changed,
            )
            count += 1

    deleted_count = 0
    for ticket_id in deleted_ids:
        try:
            delete_ticket(ticket_id)
            deleted_count += 1
        except KeyError:
            pass

    refreshed = get_project_detail(project_id)
    parts = []
    if count:
        parts.append(f"synced {count}")
    if deleted_count:
        parts.append(f"removed {deleted_count} deleted from JIRA")
    _activity(
        project_id,
        "jira_sync",
        f"JIRA sync: {', '.join(parts) or 'no changes'}",
    )
    return JiraSyncResponse(
        updated=count,
        deleted=deleted_count,
        errors=errors,
        tickets=refreshed.tickets,
    )


@app.post("/api/projects/{project_id}/jira/import", response_model=JiraImportResponse)
async def jira_import(
    project_id: str,
    body: JiraImportRequest | None = None,
) -> JiraImportResponse:
    opts = body or JiraImportRequest()
    project = _get_project_or_404(project_id)
    site, project_key = _require_jira(project)
    known_keys = list_jira_issue_keys(project_id)

    try:
        to_import, skipped = await jira_fetch_issues_to_import(site, project_key, known_keys)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    errors: list[str] = []
    imported = 0
    imported_tickets: list[TicketResponse] = []
    for item in to_import:
        try:
            ticket = import_ticket_from_jira(
                project_id,
                title=item["title"],
                description=item["description"],
                ticket_type=item["ticket_type"],
                priority=item["priority"],
                status=item["status"],
                issue_key=item["issue_key"],
                issue_id=item["issue_id"],
                url=item["url"],
                assignee=item.get("assignee"),
                jira_assignee_account_id=item.get("jira_assignee_account_id"),
            )
            imported_tickets.append(ticket)
            imported += 1
        except Exception as exc:
            errors.append(f"{item['issue_key']}: {exc}")

    enriched = 0
    if opts.enrich and imported_tickets and is_api_key_configured():
        try:
            project = get_project_detail(project_id)
            enrichment = await enrich_tickets(
                build_project_context(project),
                imported_tickets,
            )
            for item in enrichment.enrichments:
                ticket = find_ticket_by_title(project_id, item.ticket_title)
                if ticket is None:
                    continue
                enrich_ticket_fields(
                    ticket.id,
                    acceptance_criteria=item.acceptance_criteria or None,
                    estimated_points=item.estimated_points,
                    priority=item.priority,
                    ticket_type=item.ticket_type,
                )
                enriched += 1
        except Exception as exc:
            errors.append(f"AI enrichment: {exc}")

    refreshed = get_project_detail(project_id)
    _activity(project_id, "jira_import", f"Imported {imported} issue(s) from JIRA")
    return JiraImportResponse(
        imported=imported,
        skipped=skipped,
        enriched=enriched,
        errors=errors,
        tickets=refreshed.tickets,
    )


@app.post("/api/projects/{project_id}/ai/apply-commit-links", response_model=ApplyCommitLinksResponse)
async def apply_commit_links(
    project_id: str,
    min_confidence: float = 0.5,
) -> ApplyCommitLinksResponse:
    _require_llm()
    project = _get_project_or_404(project_id)
    cached = get_latest_insight(project_id, "commit_links")
    if not cached:
        raise HTTPException(
            status_code=400,
            detail="No commit links cached. Run commit linker in Command Center first.",
        )

    from schemas import CommitLinkResult, CommitTicketLink, TicketStatus as TicketStatusEnum

    links = CommitLinkResult.model_validate(cached["payload"])
    applied = 0
    skipped = 0
    details: list[str] = []

    # One best link per ticket title (AI sometimes duplicates rows per commit).
    best_by_title: dict[str, CommitTicketLink] = {}
    for link in links.links:
        key = link.ticket_title.strip().lower()
        prev = best_by_title.get(key)
        if prev is None or link.confidence > prev.confidence:
            best_by_title[key] = link

    def _resolve_status(link: CommitTicketLink, ticket) -> TicketStatusEnum | None:
        if link.suggested_status:
            return link.suggested_status
        if link.confidence < min_confidence:
            return None
        # AI matched tickets but omitted status (common when JSON fields are sparse).
        if ticket.status == TicketStatusEnum.BACKLOG:
            return TicketStatusEnum.IN_PROGRESS
        return None

    for link in best_by_title.values():
        if link.confidence < min_confidence:
            skipped += 1
            details.append(
                f"Skipped {link.ticket_title}: confidence below {int(min_confidence * 100)}%"
            )
            continue
        ticket = find_ticket_by_title(project_id, link.ticket_title)
        if ticket is None:
            skipped += 1
            details.append(f"Skipped {link.ticket_title}: ticket not found")
            continue
        target_status = _resolve_status(link, ticket)
        if target_status is None:
            skipped += 1
            if not link.suggested_status:
                details.append(
                    f"Skipped {link.ticket_title}: no status suggestion "
                    f"(currently {ticket.status.value.replace('_', ' ')})"
                )
            continue
        if ticket.status == target_status:
            skipped += 1
            details.append(
                f"Skipped {link.ticket_title}: already {target_status.value.replace('_', ' ')}"
            )
            continue
        update_ticket(ticket.id, status=target_status)
        if ticket.jira_issue_key:
            site = _jira_site_for_project(project)
            if site and jira_is_configured(site):
                try:
                    await jira_transition_issue(site, ticket.jira_issue_key, target_status)
                except Exception:
                    pass
        applied += 1
        inferred = not link.suggested_status
        suffix = " (inferred from commits)" if inferred else ""
        details.append(
            f"{link.ticket_title} → {target_status.value.replace('_', ' ')}{suffix}"
        )

    refreshed = get_project_detail(project_id)
    if applied:
        _activity(project_id, "apply_links", f"Applied statuses to {applied} ticket(s)")
    return ApplyCommitLinksResponse(
        applied=applied,
        skipped=skipped,
        details=details,
        tickets=refreshed.tickets,
    )


@app.get("/api/projects/{project_id}/git/branches", response_model=GitBranchesResponse)
async def get_git_branches(project_id: str) -> GitBranchesResponse:
    try:
        project = get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not project.repo_url and not project.local_repo_path:
        raise HTTPException(
            status_code=400,
            detail="Connect a repository before listing branches.",
        )

    try:
        branches, default_branch = await list_project_branches(
            repo_url=project.repo_url,
            local_repo_path=project.local_repo_path,
        )
        if project.repo_branch not in branches and branches:
            branches = sorted({*branches, project.repo_branch}, key=str.lower)
        return GitBranchesResponse(
            branches=branches,
            current_branch=project.repo_branch,
            default_branch=default_branch,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/git/sync", response_model=GitSyncResponse)
async def sync_git(project_id: str, body: GitSyncRequest | None = None) -> GitSyncResponse:
    try:
        project = get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    branch = (body.branch if body and body.branch else project.repo_branch).strip()
    if not branch:
        raise HTTPException(status_code=400, detail="Branch name is required.")

    if branch != project.repo_branch:
        update_project(project_id, repo_branch=branch)
        project = get_project_detail(project_id)

    try:
        raw_commits = await sync_project_commits(
            repo_url=project.repo_url,
            local_repo_path=project.local_repo_path,
            branch=branch,
        )
        commits = normalize_commit_timestamps(raw_commits)
        inserted = replace_commits(project_id, commits)
        latest = commits[0]["sha"] if commits else None
        updated = get_project_detail(project_id)
        _activity(
            project_id,
            "git_sync",
            f"Synced {inserted} commits on {branch}",
        )
        return GitSyncResponse(
            synced_commits=inserted,
            total_commits=len(updated.recent_commits),
            latest_sha=latest,
            branch=branch,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/drift/check", response_model=DriftCheckResponse)
async def check_drift(project_id: str) -> DriftCheckResponse:
    if not is_api_key_configured():
        key = api_key_env_name()
        raise HTTPException(status_code=503, detail=f"{key} is not set.")

    try:
        project = get_project_detail(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if project.spec is None:
        raise HTTPException(
            status_code=400,
            detail="No spec found. Analyze a requirement first.",
        )

    git_text = build_activity_summary(
        [
            {
                "sha": c.sha,
                "message": c.message,
                "author": c.author,
                "additions": c.additions,
                "deletions": c.deletions,
                "files_changed": c.files_changed,
            }
            for c in project.recent_commits
        ]
    )

    try:
        result = await detect_drift(
            format_spec_for_drift(project.spec),
            format_tickets_for_drift(project.tickets),
            git_text,
        )
        alerts = save_drift_analysis(project_id, result.alignment_score, result.findings)
        _activity(
            project_id,
            "drift_check",
            f"Drift check: {result.alignment_score}% aligned, {len(alerts)} alert(s)",
        )
        return DriftCheckResponse(
            alignment_score=result.alignment_score,
            summary=result.summary,
            findings=alerts,
            covered_requirements=result.covered_requirements,
            missing_requirements=result.missing_requirements,
        )
    except Exception as exc:
        mapped = map_llm_error(exc)
        if mapped:
            status, detail = mapped
            raise HTTPException(status_code=status, detail=detail) from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/drift/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    try:
        return resolve_drift_alert(alert_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}/command-center", response_model=CommandCenterResponse)
async def get_command_center(project_id: str) -> CommandCenterResponse:
    _get_project_or_404(project_id)
    cached = get_command_center_insights(project_id)

    def _parse(model_cls, key: str):
        row = cached.get(key)
        if not row:
            return None
        return model_cls.model_validate(row["payload"])

    return CommandCenterResponse(
        project_id=project_id,
        standup=_parse(StandupDigestResult, "standup"),
        sprint_plan=_parse(SprintPlanResult, "sprint_plan"),
        readiness=_parse(ReleaseReadinessResult, "readiness"),
        scope_creep=_parse(ScopeCreepResult, "scope_creep"),
        commit_links=_parse(CommitLinkResult, "commit_links"),
    )


@app.post("/api/projects/{project_id}/ai/magic", response_model=MagicRunResponse)
async def run_magic(project_id: str, body: SprintPlanRequest | None = None) -> MagicRunResponse:
    _require_llm()
    project = _get_project_or_404(project_id)
    if not project.tickets:
        raise HTTPException(status_code=400, detail="Generate tickets first.")

    opts = body or SprintPlanRequest()
    standup, sprint, readiness, creep, links = await _run_ai(
        run_magic_suite(project, opts.sprint_count, opts.capacity_per_sprint)
    )

    save_ai_insight(project_id, "standup", standup.model_dump())
    save_ai_insight(project_id, "sprint_plan", sprint.model_dump())
    save_ai_insight(project_id, "readiness", readiness.model_dump())
    save_ai_insight(project_id, "scope_creep", creep.model_dump())
    save_ai_insight(project_id, "commit_links", links.model_dump())
    _activity(project_id, "magic_run", "Run Magic completed (standup, sprint, readiness, links)")

    return MagicRunResponse(
        standup=standup,
        sprint_plan=sprint,
        readiness=readiness,
        scope_creep=creep,
        commit_links=links,
    )


@app.post("/api/projects/{project_id}/ai/standup", response_model=StandupDigestResult)
async def ai_standup(project_id: str) -> StandupDigestResult:
    _require_llm()
    project = _get_project_or_404(project_id)
    result = await _run_ai(generate_standup_for_project(project))
    save_ai_insight(project_id, "standup", result.model_dump())
    return result


@app.post("/api/projects/{project_id}/ai/sprint-plan", response_model=SprintPlanResult)
async def ai_sprint_plan(project_id: str, body: SprintPlanRequest | None = None) -> SprintPlanResult:
    _require_llm()
    project = _get_project_or_404(project_id)
    if not project.tickets:
        raise HTTPException(status_code=400, detail="Generate tickets first.")
    opts = body or SprintPlanRequest()
    result = await _run_ai(
        generate_sprint_plan(
            build_project_context(project),
            opts.sprint_count,
            opts.capacity_per_sprint,
        )
    )
    save_ai_insight(project_id, "sprint_plan", result.model_dump())
    return result


@app.post("/api/projects/{project_id}/ai/readiness", response_model=ReleaseReadinessResult)
async def ai_readiness(project_id: str) -> ReleaseReadinessResult:
    _require_llm()
    project = _get_project_or_404(project_id)
    result = await _run_ai(assess_release_readiness(build_project_context(project)))
    save_ai_insight(project_id, "readiness", result.model_dump())
    return result


@app.post("/api/projects/{project_id}/ai/scope-creep", response_model=ScopeCreepResult)
async def ai_scope_creep(project_id: str) -> ScopeCreepResult:
    _require_llm()
    project = _get_project_or_404(project_id)
    result = await _run_ai(detect_scope_creep(build_project_context(project)))
    save_ai_insight(project_id, "scope_creep", result.model_dump())
    return result


@app.post("/api/projects/{project_id}/ai/link-commits", response_model=CommitLinkResponse)
async def ai_link_commits(project_id: str) -> CommitLinkResponse:
    _require_llm()
    project = _get_project_or_404(project_id)
    if not project.recent_commits:
        raise HTTPException(status_code=400, detail="Sync git commits first.")
    result = await _run_ai(link_commits_to_tickets(build_project_context(project)))
    save_ai_insight(project_id, "commit_links", result.model_dump())
    return CommitLinkResponse(
        links=result.links,
        unlinked_commits=result.unlinked_commits,
        summary=result.summary,
    )


@app.post("/api/projects/{project_id}/ai/chat", response_model=ProjectChatResult)
async def ai_chat(project_id: str, body: ProjectChatRequest) -> ProjectChatResult:
    _require_llm()
    project = _get_project_or_404(project_id)
    return await _run_ai(
        ask_project(build_project_context(project), body.question)
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal error: {exc}"},
    )


def main() -> None:
    # On Windows the default console codec (cp1252) can't encode non-ASCII
    # output; force UTF-8 so startup logs never crash the server.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")

    port = int(os.getenv("SDLC_CONDUCTOR_PORT", "8096"))
    print(f"SDLC Conductor API : http://localhost:{port}")
    print("Start frontend: cd ../frontend && npm run dev")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
