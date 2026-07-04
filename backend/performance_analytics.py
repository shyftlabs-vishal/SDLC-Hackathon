"""Deterministic performance analytics for SDLC Conductor projects."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from schemas import (
    DriftAlertResponse,
    GitCommitResponse,
    PerformanceAnalyticsResponse,
    PerformanceBreakdownItem,
    PerformanceDeliveryMetrics,
    PerformanceDriftMetrics,
    PerformanceRecommendation,
    PerformanceVelocityMetrics,
    TicketResponse,
    TicketStatus,
)

Grade = Literal["excellent", "good", "fair", "at_risk", "critical"]

SEVERITY_PENALTY = {
    "critical": 20,
    "high": 10,
    "medium": 5,
    "low": 2,
}


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> int:
    return int(max(low, min(high, round(value))))


def _grade(score: int) -> Grade:
    if score >= 85:
        return "excellent"
    if score >= 70:
        return "good"
    if score >= 50:
        return "fair"
    if score >= 30:
        return "at_risk"
    return "critical"


def _status(score: int) -> Literal["strong", "moderate", "weak"]:
    if score >= 75:
        return "strong"
    if score >= 50:
        return "moderate"
    return "weak"


def _count_tickets_by_status(tickets: list[TicketResponse]) -> dict[str, int]:
    counts = {s.value: 0 for s in TicketStatus}
    for ticket in tickets:
        counts[ticket.status.value] = counts.get(ticket.status.value, 0) + 1
    return counts


def _compute_delivery(tickets: list[TicketResponse]) -> tuple[PerformanceDeliveryMetrics, int]:
    total = len(tickets)
    if total == 0:
        metrics = PerformanceDeliveryMetrics(
            total_tickets=0,
            done=0,
            in_progress=0,
            in_review=0,
            backlog=0,
            blocked=0,
            completion_rate=0,
            points_total=0,
            points_done=0,
            points_completion_rate=0,
        )
        return metrics, 0

    counts = _count_tickets_by_status(tickets)
    done = counts.get("done", 0)
    in_progress = counts.get("in_progress", 0)
    in_review = counts.get("in_review", 0)
    backlog = counts.get("backlog", 0)
    blocked = counts.get("blocked", 0)

    completion_rate = (done / total) * 100
    partial_credit = ((in_progress + in_review) / total) * 100 * 0.45
    blocked_penalty = min(25, (blocked / total) * 100 * 0.6)

    points_total = sum(t.estimated_points or 0 for t in tickets)
    points_done = sum(t.estimated_points or 0 for t in tickets if t.status == TicketStatus.DONE)
    points_rate = (points_done / points_total * 100) if points_total > 0 else completion_rate

    ticket_score = completion_rate * 0.55 + partial_credit * 0.25 + points_rate * 0.2 - blocked_penalty
    ticket_score = max(0, ticket_score)

    metrics = PerformanceDeliveryMetrics(
        total_tickets=total,
        done=done,
        in_progress=in_progress,
        in_review=in_review,
        backlog=backlog,
        blocked=blocked,
        completion_rate=_clamp(completion_rate),
        points_total=points_total,
        points_done=points_done,
        points_completion_rate=_clamp(points_rate),
    )
    return metrics, _clamp(ticket_score)


def _compute_drift(
    drift_alerts: list[DriftAlertResponse],
    alignment_score: int | None,
) -> tuple[PerformanceDriftMetrics, int, int]:
    open_alerts = [a for a in drift_alerts if not a.resolved]
    resolved = [a for a in drift_alerts if a.resolved]

    critical_open = sum(1 for a in open_alerts if a.severity.value == "critical")
    high_open = sum(1 for a in open_alerts if a.severity.value == "high")
    medium_open = sum(1 for a in open_alerts if a.severity.value == "medium")
    low_open = sum(1 for a in open_alerts if a.severity.value == "low")

    penalty = (
        critical_open * SEVERITY_PENALTY["critical"]
        + high_open * SEVERITY_PENALTY["high"]
        + medium_open * SEVERITY_PENALTY["medium"]
        + low_open * SEVERITY_PENALTY["low"]
    )

    if alignment_score is not None:
        alignment_component = float(alignment_score)
    else:
        alignment_component = max(0.0, 100.0 - len(open_alerts) * 8 - critical_open * 12)

    resolved_ratio = len(resolved) / max(len(drift_alerts), 1)
    resolution_bonus = resolved_ratio * 15 if drift_alerts else 0
    health_score = max(0.0, 100.0 - penalty + resolution_bonus * 0.3)

    drift_score = alignment_component * 0.65 + health_score * 0.35

    metrics = PerformanceDriftMetrics(
        alignment_score=alignment_score,
        open_alerts=len(open_alerts),
        resolved_alerts=len(resolved),
        critical_open=critical_open,
        high_open=high_open,
        drift_penalty=_clamp(penalty),
        health_score=_clamp(health_score),
    )
    return metrics, _clamp(drift_score), _clamp(alignment_component)


def _compute_velocity(
    commits: list[GitCommitResponse],
    has_repo: bool,
) -> tuple[PerformanceVelocityMetrics, int]:
    now = datetime.now(tz=UTC)
    week_ago = now - timedelta(days=7)
    fortnight_ago = now - timedelta(days=14)

    commits_7d = 0
    commits_14d = 0
    for commit in commits:
        ts = commit.committed_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts >= week_ago:
            commits_7d += 1
        if ts >= fortnight_ago:
            commits_14d += 1

    if not has_repo:
        activity_score = 40
    elif not commits:
        activity_score = 15
    else:
        activity_score = min(100.0, commits_7d * 18 + commits_14d * 6 + min(len(commits), 20) * 1.5)

    metrics = PerformanceVelocityMetrics(
        commits_last_7d=commits_7d,
        commits_last_14d=commits_14d,
        commits_tracked=len(commits),
        activity_score=_clamp(activity_score),
        has_repo=has_repo,
    )
    return metrics, _clamp(activity_score)


def _build_recommendations(
    delivery: PerformanceDeliveryMetrics,
    drift: PerformanceDriftMetrics,
    velocity: PerformanceVelocityMetrics,
    breakdown: list[PerformanceBreakdownItem],
) -> list[PerformanceRecommendation]:
    recs: list[PerformanceRecommendation] = []

    if delivery.total_tickets == 0:
        recs.append(
            PerformanceRecommendation(
                priority="high",
                title="Generate tickets",
                detail="Run requirement analysis to create a spec and actionable tickets before tracking delivery.",
            )
        )
    elif delivery.completion_rate < 40 and delivery.blocked > 0:
        recs.append(
            PerformanceRecommendation(
                priority="high",
                title="Unblock stalled work",
                detail=f"{delivery.blocked} ticket(s) are blocked — resolve blockers to improve delivery velocity.",
            )
        )
    elif delivery.completion_rate < 50:
        recs.append(
            PerformanceRecommendation(
                priority="medium",
                title="Increase ticket throughput",
                detail=f"Only {delivery.completion_rate}% of tickets are done. Focus on moving in-progress items to review.",
            )
        )

    if drift.alignment_score is None and drift.open_alerts == 0:
        recs.append(
            PerformanceRecommendation(
                priority="medium",
                title="Run a drift check",
                detail="No alignment baseline yet. Sync git activity and run drift detection to measure spec adherence.",
            )
        )
    elif drift.critical_open > 0 or drift.high_open > 0:
        recs.append(
            PerformanceRecommendation(
                priority="high",
                title="Address open drift alerts",
                detail=f"{drift.critical_open + drift.high_open} high-severity drift alert(s) are open — review on the Drift tab.",
            )
        )
    elif drift.open_alerts > 3:
        recs.append(
            PerformanceRecommendation(
                priority="medium",
                title="Reduce drift backlog",
                detail=f"{drift.open_alerts} drift alerts remain open. Resolve or accept them to improve quality score.",
            )
        )

    if velocity.has_repo and velocity.commits_last_7d == 0:
        recs.append(
            PerformanceRecommendation(
                priority="medium",
                title="No recent git activity",
                detail="No commits synced in the last 7 days. Sync git or verify the team is pushing to the linked branch.",
            )
        )
    elif not velocity.has_repo:
        recs.append(
            PerformanceRecommendation(
                priority="low",
                title="Connect a repository",
                detail="Link a GitHub repo or local path to track delivery against real code activity.",
            )
        )

    weak = [b for b in breakdown if b.status == "weak"]
    for item in weak[:2]:
        if not any(r.title.lower() in item.name.lower() for r in recs):
            recs.append(
                PerformanceRecommendation(
                    priority="medium",
                    title=f"Improve {item.name.lower()}",
                    detail=item.detail,
                )
            )

    return recs[:6]


def _build_summary(score: int, grade: Grade, delivery: PerformanceDeliveryMetrics, drift: PerformanceDriftMetrics) -> str:
    parts = [f"Overall performance is {grade.replace('_', ' ')} ({score}/100)."]
    if delivery.total_tickets > 0:
        parts.append(
            f"Delivery: {delivery.done}/{delivery.total_tickets} tickets done ({delivery.completion_rate}%)."
        )
    if drift.alignment_score is not None:
        parts.append(f"Spec alignment: {drift.alignment_score}%.")
    if drift.open_alerts > 0:
        parts.append(f"{drift.open_alerts} open drift alert(s) affecting quality.")
    return " ".join(parts)


def calculate_performance_analytics(project: Any) -> PerformanceAnalyticsResponse:
    """Compute performance analytics from a ProjectDetail-like object."""
    tickets: list[TicketResponse] = project.tickets
    drift_alerts: list[DriftAlertResponse] = project.drift_alerts
    commits: list[GitCommitResponse] = project.recent_commits
    alignment_score: int | None = project.alignment_score
    has_repo = bool(project.repo_url or project.local_repo_path)

    delivery, delivery_score = _compute_delivery(tickets)
    drift, drift_score, alignment_component = _compute_drift(drift_alerts, alignment_score)
    velocity, velocity_score = _compute_velocity(commits, has_repo)

    weights = {
        "Delivery": (delivery_score, 35),
        "Spec alignment": (alignment_component, 25),
        "Drift health": (drift.health_score, 25),
        "Git activity": (velocity_score, 15),
    }

    overall = sum(score * weight for score, weight in weights.values()) / 100
    overall = _clamp(overall)
    grade = _grade(overall)

    breakdown = [
        PerformanceBreakdownItem(
            name=name,
            score=score,
            weight_percent=weight,
            status=_status(score),
            detail=_breakdown_detail(name, delivery, drift, velocity, score),
        )
        for name, (score, weight) in weights.items()
    ]

    recommendations = _build_recommendations(delivery, drift, velocity, breakdown)
    summary = _build_summary(overall, grade, delivery, drift)

    return PerformanceAnalyticsResponse(
        overall_score=overall,
        grade=grade,
        summary=summary,
        delivery=delivery,
        drift=drift,
        velocity=velocity,
        breakdown=breakdown,
        recommendations=recommendations,
    )


def _breakdown_detail(
    name: str,
    delivery: PerformanceDeliveryMetrics,
    drift: PerformanceDriftMetrics,
    velocity: PerformanceVelocityMetrics,
    score: int,
) -> str:
    if name == "Delivery":
        if delivery.total_tickets == 0:
            return "No tickets to measure yet."
        return (
            f"{delivery.done} done, {delivery.in_progress} in progress, "
            f"{delivery.blocked} blocked — {delivery.completion_rate}% complete."
        )
    if name == "Spec alignment":
        if drift.alignment_score is None:
            return "Run drift detection to establish an alignment baseline."
        return f"Latest alignment score is {drift.alignment_score}% against spec and tickets."
    if name == "Drift health":
        if drift.open_alerts == 0:
            return "No open drift alerts — quality signal is clean."
        return (
            f"{drift.open_alerts} open alert(s) "
            f"({drift.critical_open} critical, {drift.high_open} high severity)."
        )
    if velocity.has_repo:
        return (
            f"{velocity.commits_last_7d} commits in 7 days, "
            f"{velocity.commits_tracked} total tracked."
        )
    return "Repository not connected — activity score uses baseline only."
