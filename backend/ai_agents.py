"""AI-powered ceremony and intelligence agents."""

from __future__ import annotations

import asyncio

from continuum.agent import BaseAgent
from continuum.agent.config import AgentConfig, AgentMemoryConfig

from agents import MAGIC_AGENT_DELAY_SEC, run_structured
from llm_config import get_default_model
from project_context import build_standup_context
from schemas import (
    CommitLinkResult,
    ProjectChatResult,
    ReleaseReadinessResult,
    ScopeCreepResult,
    SprintPlanResult,
    StandupDigestResult,
    TicketEnrichmentResult,
    TicketResponse,
)
from text_sanitize import dedupe_clause, polish_standup

_STANDUP = """You are an expert Scrum Master AI assistant generating a daily standup digest.

Use the project data provided. Output MUST be valid JSON matching the schema exactly.

Rules:
- Write COMPLETE sentences only — every sentence must end with . ! or ?
- standup_script: 250-450 words, spoken format (Yesterday / Today / Blockers). End with "Who wants to start?"
- slack_message: concise markdown bullets (shorter than standup_script)
- blockers: max 5 items. Each blocker needs:
  - title: short label (ticket name or 5-8 words), NOT a full sentence
  - description: ONE sentence explaining the blocker (do NOT repeat the title)
  - ticket_title: exact ticket title if applicable
  - severity: critical|high|medium|low
- wins: max 5, evidence-based from git or done tickets
- today_suggestions: max 5 actionable items
- NEVER duplicate the same sentence or clause twice
- Do NOT truncate mid-sentence
"""

_SPRINT = """You are a sprint planning AI for agile teams.

Group tickets into sprints respecting dependencies, priorities, and story points.
Use ticket titles exactly as provided in assignments.

Rules:
- Each ticket appears in at most one sprint
- Earlier sprints contain foundation/dependency work
- total_points per sprint should not exceed capacity_per_sprint unless warned
- Include warnings for overloaded sprints or missing estimates
"""

_READINESS = """You are a release readiness AI assessor.

Score 0-100 whether the project is ready to ship/release.
verdict: ship (80+), caution (50-79), not_ready (<50)

Consider: ticket completion %, alignment score, drift alerts, open questions, scope creep risk.
checklist: 5-8 items with pass/warn/fail
stakeholder_message: plain English for non-technical leadership
"""

_SCOPE = """You are a scope creep detection AI — protect the sprint from unplanned work.

Compare git activity and tickets against spec goals AND non_goals.
Flag work that expands scope, violates non-goals, or adds unplanned features.
creep_score: 0-100 (higher = more creep detected)
"""

_LINK = """You are an AI that links git commits to tickets.

Match commits to tickets using: commit message keywords, ticket titles, file paths, semantic similarity.
confidence: 0.0-1.0

For EVERY link you output, you MUST set:
- commit_shas: list of short SHAs copied exactly from the GIT COMMITS section (e.g. ["a1b2c3d"])
- evidence: one sentence citing the commit message or files
- suggested_status: backlog | in_progress | in_review | done (never null)
- Commits show active work on a backlog ticket → in_progress
- Commits look complete/merged/fix shipped → in_review or done
- Ticket already done and commits are follow-up → done
- Never leave suggested_status null on a link

Only link when reasonably confident (>0.4). Prefer one row per ticket (merge commit_shas).
"""

_CHAT = """You are SDLC Conductor AI — a project intelligence assistant for scrum masters.

Answer questions using ONLY the provided project context (spec, tickets, git, drift).
Be direct, actionable, and cite specific tickets/commits when relevant.
suggested_actions: 1-3 concrete next steps
"""

_ENRICH = """You enrich thin or imported tickets with agile metadata.

For each ticket in the input list, output:
- ticket_title: exact title from input (for matching)
- acceptance_criteria: 3-5 testable criteria
- estimated_points: fibonacci 1,2,3,5,8,13 or null if unclear
- priority: only if clearly wrong vs description
- ticket_type: only if clearly wrong

Use project spec context when available. Be practical, not verbose.
"""


def _agent(name: str, instructions: str, schema: type, temperature: float = 0.3, max_tokens: int | None = None) -> BaseAgent:
    return BaseAgent(
        name=name,
        instructions=instructions,
        model=get_default_model(),
        temperature=temperature,
        max_tokens=max_tokens,
        output_schema=schema,
        memory_config=AgentMemoryConfig(search_memories=False, store_memories=False),
        config=AgentConfig(input_sanitization=False, max_turns=3),
    )


async def generate_standup(context: str) -> StandupDigestResult:
    result = await run_structured(
        _agent("standup-digest", _STANDUP, StandupDigestResult, 0.35, max_tokens=8192),
        f"Generate today's standup digest.\n\n{context}",
    )
    return polish_standup(result)


async def generate_standup_for_project(project) -> StandupDigestResult:
    return await generate_standup(build_standup_context(project))


async def generate_sprint_plan(
    context: str,
    sprint_count: int = 2,
    capacity: int = 21,
) -> SprintPlanResult:
    return await run_structured(
        _agent("sprint-planner", _SPRINT, SprintPlanResult, 0.3),
        f"""Plan {sprint_count} sprints with capacity {capacity} points each.

{context}""",
    )


async def assess_release_readiness(context: str) -> ReleaseReadinessResult:
    return await run_structured(
        _agent("release-readiness", _READINESS, ReleaseReadinessResult, 0.2),
        f"Assess release readiness.\n\n{context}",
    )


async def detect_scope_creep(context: str) -> ScopeCreepResult:
    return await run_structured(
        _agent("scope-creep", _SCOPE, ScopeCreepResult, 0.25),
        f"Detect scope creep.\n\n{context}",
    )


async def link_commits_to_tickets(context: str) -> CommitLinkResult:
    return await run_structured(
        _agent("commit-linker", _LINK, CommitLinkResult, 0.2),
        f"Link commits to tickets.\n\n{context}",
    )


async def ask_project(context: str, question: str) -> ProjectChatResult:
    return await run_structured(
        _agent("project-chat", _CHAT, ProjectChatResult, 0.35),
        f"QUESTION: {question.strip()}\n\nPROJECT CONTEXT:\n{context}",
    )


async def enrich_tickets(context: str, tickets: list[TicketResponse]) -> TicketEnrichmentResult:
    if not tickets:
        return TicketEnrichmentResult(enrichments=[], summary="No tickets to enrich.")
    lines = []
    for t in tickets[:25]:
        lines.append(
            f"- {t.title}\n  Type: {t.ticket_type.value} | Priority: {t.priority.value}\n"
            f"  Description: {t.description[:400]}"
        )
    ticket_block = "\n".join(lines)
    return await run_structured(
        _agent("ticket-enricher", _ENRICH, TicketEnrichmentResult, 0.25),
        f"""Enrich these tickets with acceptance criteria and story points.

PROJECT CONTEXT:
{context}

TICKETS TO ENRICH:
{ticket_block}""",
    )


async def run_magic_suite(
    project,
    sprint_count: int = 2,
    capacity: int = 21,
) -> tuple[StandupDigestResult, SprintPlanResult, ReleaseReadinessResult, ScopeCreepResult, CommitLinkResult]:
    """Run agents sequentially with pacing to avoid OpenAI rate limits."""
    from project_context import build_project_context

    context = build_project_context(project)
    standup = await generate_standup_for_project(project)
    await asyncio.sleep(MAGIC_AGENT_DELAY_SEC)
    sprint = await generate_sprint_plan(context, sprint_count, capacity)
    await asyncio.sleep(MAGIC_AGENT_DELAY_SEC)
    readiness = await assess_release_readiness(context)
    await asyncio.sleep(MAGIC_AGENT_DELAY_SEC)
    creep = await detect_scope_creep(context)
    await asyncio.sleep(MAGIC_AGENT_DELAY_SEC)
    links = await link_commits_to_tickets(context)
    return standup, sprint, readiness, creep, links
