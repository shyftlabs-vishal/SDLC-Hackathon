"""Normalize LLM JSON output (especially Gemini) into strict Pydantic schemas."""

from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from schemas import (
    DriftAnalysisResult,
    DriftSeverity,
    GeneratedSpec,
    GeneratedTicket,
    RequirementAnalysisResult,
    TicketPriority,
    TicketType,
)

T = TypeVar("T", bound=BaseModel)


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValueError("Empty response")

    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(text[start : end + 1])
        else:
            raise
    if not isinstance(parsed, dict):
        raise ValueError("Expected JSON object")
    return parsed


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _as_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip() or default
    if isinstance(value, list):
        return "\n".join(str(v) for v in value if str(v).strip())
    if isinstance(value, dict):
        return json.dumps(value, indent=2)
    return str(value)


def _normalize_ticket_type(raw: Any, title: str = "") -> TicketType:
    value = str(raw or "").lower().strip()
    mapping = {
        "feature": TicketType.FEATURE,
        "bug": TicketType.BUG,
        "task": TicketType.TASK,
        "spike": TicketType.SPIKE,
        "chore": TicketType.CHORE,
        "story": TicketType.FEATURE,
        "enhancement": TicketType.FEATURE,
        "documentation": TicketType.CHORE,
        "doc": TicketType.CHORE,
        "test": TicketType.TASK,
        "testing": TicketType.TASK,
    }
    if value in mapping:
        return mapping[value]

    prefix = title.upper()
    if prefix.startswith(("TEST:", "QA:")):
        return TicketType.TASK
    if prefix.startswith(("DOCS:", "DOC:")):
        return TicketType.CHORE
    if prefix.startswith(("SPIKE:", "POC:")):
        return TicketType.SPIKE
    if prefix.startswith(("BUG:", "FIX:")):
        return TicketType.BUG
    return TicketType.FEATURE


def _normalize_priority(raw: Any) -> TicketPriority:
    value = str(raw or "medium").lower().strip()
    mapping = {
        "critical": TicketPriority.CRITICAL,
        "high": TicketPriority.HIGH,
        "medium": TicketPriority.MEDIUM,
        "low": TicketPriority.LOW,
        "p0": TicketPriority.CRITICAL,
        "p1": TicketPriority.HIGH,
        "p2": TicketPriority.MEDIUM,
        "p3": TicketPriority.LOW,
    }
    return mapping.get(value, TicketPriority.MEDIUM)


def _normalize_severity(raw: Any) -> DriftSeverity:
    value = str(raw or "medium").lower().strip()
    mapping = {s.value: s for s in DriftSeverity}
    return mapping.get(value, DriftSeverity.MEDIUM)


def _normalize_ticket(raw: dict[str, Any]) -> dict[str, Any]:
    title = _as_text(raw.get("title") or raw.get("name") or raw.get("summary"), "Untitled ticket")
    return {
        "title": title,
        "description": _as_text(
            raw.get("description") or raw.get("details") or raw.get("body"),
            title,
        ),
        "ticket_type": _normalize_ticket_type(
            raw.get("ticket_type") or raw.get("type") or raw.get("category"),
            title,
        ),
        "priority": _normalize_priority(raw.get("priority")),
        "acceptance_criteria": _as_list(
            raw.get("acceptance_criteria")
            or raw.get("acceptanceCriteria")
            or raw.get("criteria")
        ),
        "estimated_points": raw.get("estimated_points")
        or raw.get("points")
        or raw.get("story_points")
        or raw.get("estimate"),
        "dependencies": _as_list(raw.get("dependencies") or raw.get("depends_on")),
    }


def _normalize_spec_block(raw: dict[str, Any], fallback_title: str = "Project Specification") -> dict[str, Any]:
    scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}

    overview = _as_text(
        raw.get("overview")
        or raw.get("introduction")
        or raw.get("summary")
        or raw.get("description"),
        "Specification generated from requirement.",
    )
    title = _as_text(
        raw.get("title") or raw.get("name") or raw.get("project_title"),
        fallback_title,
    )
    if title == fallback_title and overview:
        first_line = overview.split("\n")[0].strip()
        if 10 < len(first_line) < 120:
            title = first_line.rstrip(".")

    non_goals = _as_list(raw.get("non_goals") or raw.get("nonGoals"))
    non_goals.extend(_as_list(raw.get("out_of_scope_items") or scope.get("out_of_scope")))
    if not non_goals:
        non_goals = _as_list(scope.get("out_of_scope_items"))

    acceptance = _as_list(raw.get("acceptance_criteria") or raw.get("acceptanceCriteria"))
    functional = _as_list(raw.get("functional_requirements"))
    if functional:
        acceptance = acceptance or functional

    technical = _as_text(
        raw.get("technical_approach")
        or raw.get("technical_architecture")
        or raw.get("architecture")
        or raw.get("technicalArchitecture"),
        "See tickets for implementation breakdown.",
    )

    constraints = _as_list(raw.get("constraints"))
    constraints.extend(_as_list(raw.get("non_functional_requirements")))

    open_questions = _as_list(raw.get("open_questions") or raw.get("openQuestions"))
    open_questions.extend(_as_list(raw.get("assumptions")))

    goals = _as_list(raw.get("goals"))
    goals.extend(_as_list(raw.get("user_stories")))
    in_scope = _as_list(raw.get("in_scope_items") or scope.get("in_scope"))
    if in_scope and not goals:
        goals = in_scope

    return {
        "title": title,
        "overview": overview,
        "goals": goals,
        "non_goals": non_goals,
        "acceptance_criteria": acceptance,
        "technical_approach": technical,
        "constraints": constraints,
        "risks": _as_list(raw.get("risks")),
        "open_questions": open_questions,
    }


def normalize_requirement_analysis(raw: str | dict[str, Any]) -> RequirementAnalysisResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw

    spec_source = data.get("spec") if isinstance(data.get("spec"), dict) else data
    spec_data = _normalize_spec_block(spec_source)

    raw_tickets = data.get("tickets") or data.get("issues") or data.get("tasks") or []
    if not isinstance(raw_tickets, list) or not raw_tickets:
        raise ValueError("No tickets found in LLM response")

    tickets = [GeneratedTicket.model_validate(_normalize_ticket(t)) for t in raw_tickets if isinstance(t, dict)]
    if not tickets:
        raise ValueError("Could not parse any tickets from LLM response")

    summary = _as_text(
        data.get("summary") or data.get("executive_summary") or spec_data["overview"][:500],
        "Requirement analyzed successfully.",
    )

    return RequirementAnalysisResult(
        spec=GeneratedSpec.model_validate(spec_data),
        tickets=tickets,
        summary=summary,
    )


def normalize_drift_analysis(raw: str | dict[str, Any]) -> DriftAnalysisResult:
    data = _extract_json(raw) if isinstance(raw, str) else raw

    findings_raw = data.get("findings") or data.get("drift_findings") or data.get("alerts") or []
    findings = []
    for item in findings_raw if isinstance(findings_raw, list) else []:
        if not isinstance(item, dict):
            continue
        findings.append(
            {
                "severity": _normalize_severity(item.get("severity")),
                "title": _as_text(item.get("title"), "Drift detected"),
                "description": _as_text(item.get("description"), ""),
                "spec_reference": _as_text(
                    item.get("spec_reference") or item.get("specReference") or item.get("requirement"),
                    "Spec",
                ),
                "code_evidence": _as_text(
                    item.get("code_evidence") or item.get("evidence") or item.get("git_evidence"),
                    "No evidence provided",
                ),
                "recommendation": _as_text(
                    item.get("recommendation") or item.get("remediation") or item.get("action"),
                    "Review and align implementation with spec.",
                ),
                "affected_tickets": _as_list(item.get("affected_tickets") or item.get("tickets")),
            }
        )

    score = data.get("alignment_score") or data.get("alignmentScore") or data.get("score") or 50
    try:
        score = max(0, min(100, int(score)))
    except (TypeError, ValueError):
        score = 50

    return DriftAnalysisResult(
        alignment_score=score,
        summary=_as_text(data.get("summary"), "Drift analysis complete."),
        findings=findings,
        covered_requirements=_as_list(
            data.get("covered_requirements") or data.get("coveredRequirements")
        ),
        missing_requirements=_as_list(
            data.get("missing_requirements") or data.get("missingRequirements")
        ),
    )


def try_normalize_output(schema: type[T], content: str | None) -> T | None:
    if not content or not content.strip():
        return None
    try:
        if schema is RequirementAnalysisResult:
            return normalize_requirement_analysis(content)  # type: ignore[return-value]
        if schema is DriftAnalysisResult:
            return normalize_drift_analysis(content)  # type: ignore[return-value]
    except (ValueError, ValidationError, json.JSONDecodeError):
        return None
    return None
