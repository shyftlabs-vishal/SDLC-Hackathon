"""Normalize Gemini AI ceremony outputs into strict schemas."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from response_normalizer import _as_list, _as_text, _extract_json, _normalize_severity
from text_sanitize import dedupe_clause, polish_standup
from schemas import (
    CommitLinkResult,
    CommitTicketLink,
    ProjectChatResult,
    ReadinessCheckItem,
    ReleaseReadinessResult,
    ScopeCreepItem,
    ScopeCreepResult,
    SprintPlanItem,
    SprintPlanResult,
    StandupBlocker,
    StandupDigestResult,
    TicketEnrichmentItem,
    TicketEnrichmentResult,
    TicketPriority,
    TicketStatus,
    TicketType,
)


def _clamp_score(value: Any, default: int = 50) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def _normalize_blockers(raw: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for b in raw if isinstance(raw, list) else []:
        if isinstance(b, str):
            items.append(
                {"title": b[:100], "description": b, "ticket_title": None, "severity": "medium"}
            )
        elif isinstance(b, dict):
            ticket = b.get("ticket_title") or b.get("ticket")
            desc = dedupe_clause(
                _as_text(b.get("description") or b.get("detail") or b.get("message"), "Blocker identified")
            )
            title = _as_text(b.get("title") or b.get("name"), "")
            if ticket:
                short_title = str(ticket)[:120]
            elif title and title != desc:
                short_title = title[:120]
            else:
                short_title = desc[:80] + ("..." if len(desc) > 80 else "")
            items.append(
                {
                    "title": short_title,
                    "description": desc if desc != short_title else dedupe_clause(desc),
                    "ticket_title": ticket,
                    "severity": str(b.get("severity") or "medium").lower(),
                }
            )
    return items


def normalize_standup(raw: str | dict[str, Any]) -> StandupDigestResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    script = _as_text(
        data.get("standup_script") or data.get("script") or data.get("standup"),
        "Standup digest generated.",
    )
    slack = _as_text(
        data.get("slack_message") or data.get("slack") or data.get("teams_message"),
        script,
    )
    return polish_standup(
        StandupDigestResult(
            headline=dedupe_clause(_as_text(data.get("headline") or data.get("title"), "Daily Standup Digest")),
            summary=_as_text(data.get("summary") or data.get("overview"), ""),
            wins=_as_list(data.get("wins") or data.get("celebrations")),
            blockers=[StandupBlocker.model_validate(b) for b in _normalize_blockers(data.get("blockers"))],
            today_suggestions=_as_list(
                data.get("today_suggestions") or data.get("today") or data.get("focus")
            ),
            per_person_updates=_as_list(
                data.get("per_person_updates") or data.get("updates") or data.get("team_updates")
            ),
            standup_script=dedupe_clause(script),
            slack_message=dedupe_clause(slack),
        )
    )


def normalize_sprint_plan(raw: str | dict[str, Any]) -> SprintPlanResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    sprints_raw = data.get("sprints") or data.get("sprint_plans") or []
    sprints: list[SprintPlanItem] = []
    for i, s in enumerate(sprints_raw if isinstance(sprints_raw, list) else []):
        if not isinstance(s, dict):
            continue
        titles = _as_list(
            s.get("ticket_titles") or s.get("tickets") or s.get("items")
        )
        pts = s.get("total_points") or s.get("points") or 0
        try:
            pts = int(pts)
        except (TypeError, ValueError):
            pts = 0
        sprints.append(
            SprintPlanItem(
                name=_as_text(s.get("name") or s.get("sprint"), f"Sprint {i + 1}"),
                goal=_as_text(s.get("goal") or s.get("objective"), ""),
                ticket_titles=titles or ["Unassigned"],
                total_points=pts,
                rationale=_as_text(s.get("rationale") or s.get("reason"), ""),
            )
        )
    if not sprints:
        raise ValueError("No sprints in response")
    return SprintPlanResult(
        summary=_as_text(data.get("summary"), "Sprint plan generated."),
        sprints=sprints,
        warnings=_as_list(data.get("warnings") or data.get("risks")),
        recommended_capacity_per_sprint=int(data.get("recommended_capacity_per_sprint") or 21),
    )


def normalize_readiness(raw: str | dict[str, Any]) -> ReleaseReadinessResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    score = _clamp_score(data.get("readiness_score") or data.get("score"), 50)
    verdict = str(data.get("verdict") or "caution").lower().replace(" ", "_")
    if verdict not in ("ship", "caution", "not_ready"):
        verdict = "ship" if score >= 80 else "caution" if score >= 50 else "not_ready"

    checklist: list[ReadinessCheckItem] = []
    for item in data.get("checklist") or data.get("checks") or []:
        if isinstance(item, str):
            checklist.append(ReadinessCheckItem(label=item, status="warn", detail=item))
        elif isinstance(item, dict):
            status = str(item.get("status") or "warn").lower()
            if status not in ("pass", "warn", "fail"):
                status = "warn"
            checklist.append(
                ReadinessCheckItem(
                    label=_as_text(item.get("label") or item.get("name"), "Check"),
                    status=status,  # type: ignore[arg-type]
                    detail=_as_text(item.get("detail") or item.get("description"), ""),
                )
            )

    return ReleaseReadinessResult(
        readiness_score=score,
        verdict=verdict,  # type: ignore[arg-type]
        summary=_as_text(data.get("summary"), "Readiness assessed."),
        checklist=checklist,
        blockers=_as_list(data.get("blockers")),
        stakeholder_message=_as_text(
            data.get("stakeholder_message") or data.get("executive_summary"),
            _as_text(data.get("summary"), ""),
        ),
    )


def normalize_scope_creep(raw: str | dict[str, Any]) -> ScopeCreepResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    items: list[ScopeCreepItem] = []
    for item in data.get("items") or data.get("findings") or data.get("alerts") or []:
        if not isinstance(item, dict):
            continue
        items.append(
            ScopeCreepItem(
                severity=_normalize_severity(item.get("severity")),
                title=_as_text(item.get("title") or item.get("name"), "Scope creep"),
                description=_as_text(item.get("description"), ""),
                evidence=_as_text(item.get("evidence") or item.get("code_evidence"), ""),
                recommendation=_as_text(
                    item.get("recommendation") or item.get("action"), "Review with team."
                ),
            )
        )
    return ScopeCreepResult(
        creep_score=_clamp_score(data.get("creep_score") or data.get("score"), 0),
        summary=_as_text(data.get("summary"), "Scope creep analysis complete."),
        items=items,
    )


def _normalize_status(raw: Any) -> TicketStatus | None:
    if not raw:
        return None
    value = str(raw).lower().replace(" ", "_").replace("-", "_")
    mapping = {s.value: s for s in TicketStatus}
    return mapping.get(value)


def normalize_commit_links(raw: str | dict[str, Any]) -> CommitLinkResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    links: list[CommitTicketLink] = []
    for item in data.get("links") or data.get("mappings") or []:
        if not isinstance(item, dict):
            continue
        shas = item.get("commit_shas") or item.get("commits") or item.get("shas") or []
        if isinstance(shas, str):
            shas = [shas]
        conf = item.get("confidence") or 0.5
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = 0.5
        links.append(
            CommitTicketLink(
                ticket_title=_as_text(item.get("ticket_title") or item.get("ticket"), "Unknown"),
                commit_shas=[str(s) for s in shas],
                confidence=max(0.0, min(1.0, conf)),
                evidence=_as_text(item.get("evidence") or item.get("reason"), ""),
                suggested_status=_normalize_status(
                    item.get("suggested_status") or item.get("status")
                ),
            )
        )
    unlinked = _as_list(data.get("unlinked_commits") or data.get("unlinked"))
    return CommitLinkResult(
        links=links,
        unlinked_commits=unlinked,
        summary=_as_text(data.get("summary"), f"Linked {len(links)} tickets to commits."),
    )


def normalize_project_chat(raw: str | dict[str, Any]) -> ProjectChatResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    if "answer" not in data and len(data) == 1:
        key = next(iter(data))
        data = {"answer": data[key]}
    return ProjectChatResult(
        answer=_as_text(data.get("answer") or data.get("response") or data.get("content"), ""),
        cited_tickets=_as_list(data.get("cited_tickets") or data.get("tickets")),
        cited_commits=_as_list(data.get("cited_commits") or data.get("commits")),
        suggested_actions=_as_list(
            data.get("suggested_actions") or data.get("actions") or data.get("next_steps")
        ),
    )


def normalize_ticket_enrichment(raw: str | dict[str, Any]) -> TicketEnrichmentResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw
    items_raw = data.get("enrichments") or data.get("tickets") or []
    items: list[TicketEnrichmentItem] = []
    for item in items_raw if isinstance(items_raw, list) else []:
        if not isinstance(item, dict):
            continue
        pts = item.get("estimated_points") or item.get("points")
        try:
            pts = int(pts) if pts is not None else None
        except (TypeError, ValueError):
            pts = None
        priority_raw = item.get("priority")
        type_raw = item.get("ticket_type") or item.get("type")
        items.append(
            TicketEnrichmentItem(
                ticket_title=_as_text(item.get("ticket_title") or item.get("title"), ""),
                acceptance_criteria=_as_list(
                    item.get("acceptance_criteria") or item.get("criteria")
                ),
                estimated_points=pts,
                priority=TicketPriority(priority_raw) if priority_raw else None,
                ticket_type=TicketType(type_raw) if type_raw else None,
            )
        )
    return TicketEnrichmentResult(
        enrichments=[i for i in items if i.ticket_title],
        summary=_as_text(data.get("summary"), f"Enriched {len(items)} tickets."),
    )


def try_normalize_ai_output(schema: type, content: str | None):
    if not content or not content.strip():
        return None
    normalizers = {
        StandupDigestResult: normalize_standup,
        SprintPlanResult: normalize_sprint_plan,
        ReleaseReadinessResult: normalize_readiness,
        ScopeCreepResult: normalize_scope_creep,
        CommitLinkResult: normalize_commit_links,
        ProjectChatResult: normalize_project_chat,
        TicketEnrichmentResult: normalize_ticket_enrichment,
    }
    fn = normalizers.get(schema)
    if fn is None:
        return None
    try:
        return fn(content)
    except (ValueError, ValidationError, json.JSONDecodeError, KeyError, TypeError):
        return None
