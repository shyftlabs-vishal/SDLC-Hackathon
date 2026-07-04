"""Generate exportable project reports (markdown)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from performance_analytics import calculate_performance_analytics
from schemas import ReleaseReadinessResult


def _fmt_dt(value: datetime | str | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        return value[:19].replace("T", " ")
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _bullet_list(items: list[str], empty: str = "_None_") -> str:
    if not items:
        return empty
    return "\n".join(f"- {item}" for item in items)


def generate_project_report(
    project: Any,
    *,
    readiness: ReleaseReadinessResult | None = None,
) -> str:
    """Build a markdown report for stakeholders / judges."""
    performance = calculate_performance_analytics(project)
    open_drifts = [a for a in project.drift_alerts if not a.resolved]
    done = sum(1 for t in project.tickets if t.status.value == "done")
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    lines: list[str] = [
        f"# SDLC Conductor Report — {project.name}",
        "",
        f"_Generated {generated_at}_",
        "",
        "## Executive summary",
        "",
        performance.summary,
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Overall performance | **{performance.overall_score}/100** ({performance.grade.replace('_', ' ')}) |",
        f"| Alignment score | {project.alignment_score if project.alignment_score is not None else 'Not checked'}% |",
        f"| Tickets done | {done}/{len(project.tickets)} |",
        f"| Open drift alerts | {len(open_drifts)} |",
        f"| Commits tracked | {len(project.recent_commits)} |",
        "",
    ]

    if readiness:
        verdict_label = readiness.verdict.replace("_", " ").title()
        lines.extend(
            [
                "## Release readiness",
                "",
                f"**Verdict:** {verdict_label} ({readiness.readiness_score}/100)",
                "",
                readiness.summary,
                "",
                readiness.stakeholder_message,
                "",
            ]
        )
        if readiness.blockers:
            lines.extend(["**Blockers:**", "", _bullet_list(readiness.blockers), ""])

    if project.spec:
        spec = project.spec
        lines.extend(
            [
                "## Technical specification",
                "",
                f"### {spec.title}",
                "",
                spec.overview,
                "",
                "**Goals**",
                "",
                _bullet_list(spec.goals),
                "",
                "**Acceptance criteria**",
                "",
                _bullet_list(spec.acceptance_criteria),
                "",
                "**Technical approach**",
                "",
                spec.technical_approach,
                "",
            ]
        )

    lines.extend(
        [
            "## Performance breakdown",
            "",
            f"| Dimension | Score | Weight |",
            f"|-----------|-------|--------|",
        ]
    )
    for item in performance.breakdown:
        lines.append(f"| {item.name} | {item.score}/100 | {item.weight_percent}% |")
    lines.append("")

    if performance.recommendations:
        lines.extend(["## Recommendations", ""])
        for rec in performance.recommendations:
            lines.append(f"- **[{rec.priority.upper()}]** {rec.title} — {rec.detail}")
        lines.append("")

    if open_drifts:
        lines.extend(["## Open drift alerts", ""])
        for alert in open_drifts[:15]:
            lines.extend(
                [
                    f"### [{alert.severity.value.upper()}] {alert.title}",
                    "",
                    alert.description,
                    "",
                    f"_Spec reference:_ {alert.spec_reference}",
                    "",
                    f"_Recommendation:_ {alert.recommendation}",
                    "",
                ]
            )

    if project.tickets:
        lines.extend(["## Tickets", ""])
        for ticket in project.tickets[:40]:
            ac = "; ".join(ticket.acceptance_criteria[:3]) if ticket.acceptance_criteria else "—"
            lines.append(
                f"- **{ticket.title}** ({ticket.status.value}) — "
                f"{ticket.priority.value} | {ticket.estimated_points or '?'} pts | AC: {ac}"
            )
        if len(project.tickets) > 40:
            lines.append(f"\n_…and {len(project.tickets) - 40} more tickets._")
        lines.append("")

    if project.recent_commits:
        lines.extend(["## Recent git activity", ""])
        for commit in project.recent_commits[:15]:
            lines.append(
                f"- `[{commit.sha}]` {commit.message} — {commit.author} ({_fmt_dt(commit.committed_at)})"
            )
        lines.append("")

    lines.extend(
        [
            "---",
            "",
            "_Report generated by [SDLC Conductor](https://github.com/shyftlabs/continuum)_",
        ]
    )
    return "\n".join(lines)
