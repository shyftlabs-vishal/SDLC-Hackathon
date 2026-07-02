"""Continuum agents for SDLC Conductor."""

from __future__ import annotations

import asyncio
import re

from continuum.agent import AgentRunner, BaseAgent
from continuum.agent.config import AgentConfig, AgentMemoryConfig, RunnerConfig
from continuum.agent.types import ResponseStatus
from continuum.core.container import Container, ContainerConfig
from continuum.llm import LLMAuthenticationError, LLMRateLimitError, LLMServiceUnavailableError

from llm_config import (
    api_key_env_name,
    get_default_model,
    get_model_chain,
)
from ai_normalizer import try_normalize_ai_output
from response_normalizer import try_normalize_output
from schemas import DriftAnalysisResult, RequirementAnalysisResult

MAX_RATE_LIMIT_RETRIES = 4
MAGIC_AGENT_DELAY_SEC = 2.5

# Cap output tokens so gateway/LLM calls stay bounded. An unbounded (None)
# max_tokens makes the Aura Smart Gateway generate until an internal ceiling,
# which routinely exceeds the request timeout and looks like a hang. The gateway
# also 400s (max_tokens_truncation) instead of returning partial output when the
# cap is hit mid-JSON, so the cap must be large enough for a full spec + tickets.
MAX_OUTPUT_TOKENS = 8192

REQUIREMENTS_INSTRUCTIONS = """You are SDLC Conductor, a senior product engineer and technical lead.

Given a software requirement, produce JSON with EXACTLY this structure:
{
  "spec": {
    "title": "...",
    "overview": "...",
    "goals": ["..."],
    "non_goals": ["..."],
    "acceptance_criteria": ["..."],
    "technical_approach": "...",
    "constraints": ["..."],
    "risks": ["..."],
    "open_questions": ["..."]
  },
  "tickets": [
    {
      "title": "...",
      "description": "...",
      "ticket_type": "feature|bug|task|spike|chore",
      "priority": "critical|high|medium|low",
      "acceptance_criteria": ["..."],
      "estimated_points": 3,
      "dependencies": ["other ticket title"]
    }
  ],
  "summary": "Brief executive summary"
}

Rules:
- Use field names exactly as shown (ticket_type, not type).
- Tickets should be independently deliverable where possible.
- Each ticket needs testable acceptance criteria.
- Prioritize logically: foundations before features, features before polish.
- Use realistic story point estimates (1, 2, 3, 5, 8, 13).
- Flag ambiguities in open_questions rather than guessing.
- Be specific about APIs, data models, and user flows when inferring from the requirement.

Output size limits (IMPORTANT — keep the response compact so it is never truncated):
- Produce AT MOST 8 tickets, covering the most important work.
- Every string field: 1-2 sentences. Every list: at most 5 short items.
- Do NOT repeat the same sentence, clause, or acceptance criterion twice.
- Return ONLY the JSON object — no markdown fences or prose.
"""

DRIFT_INSTRUCTIONS = """You are SDLC Conductor's drift detection engine — a rigorous staff engineer.

Compare the AGREED specification and tickets against RECENT git activity.
Identify where implementation has diverged from what was agreed, or where work is missing.

Rules:
- alignment_score: 0-100 (100 = perfect alignment with spec and tickets).
- Only flag real drift — do not invent problems.
- Reference specific spec items or ticket titles in findings.
- Use git commit messages and changed files as evidence.
- Severity: critical (wrong behavior/security), high (missing core feature), medium (partial/incomplete), low (minor deviation), info (observation).
- covered_requirements: spec/ticket items that commits suggest are done.
- missing_requirements: spec/ticket items with no evidence in git activity.
- If no git activity exists, score based on ticket backlog vs spec completeness and note missing implementation.
"""

_runner: AgentRunner | None = None


def get_runner() -> AgentRunner:
    global _runner
    if _runner is None:
        container = Container(
            ContainerConfig(
                enable_memory=False,
                enable_session=False,
                enable_langfuse=False,
            )
        )
        _runner = AgentRunner(
            container=container,
            config=RunnerConfig(
                circuit_breaker_threshold=100,
                circuit_breaker_cooldown=10,
            ),
        )
    return _runner


def reset_runner() -> None:
    global _runner
    _runner = None


def _model_chain() -> list[str]:
    return get_model_chain()


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (LLMRateLimitError, LLMServiceUnavailableError)):
        return True
    message = str(exc).lower()
    return (
        "rate_limit" in message
        or "quota" in message
        or "high demand" in message
        or "circuit breaker" in message
    )


def _circuit_breaker_wait(exc: Exception) -> float:
    match = re.search(r"retry after ([\d.]+)s", str(exc), re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r"retry in ([\d.]+)s", str(exc), re.IGNORECASE)
    if match:
        return float(match.group(1))
    return 10.0


async def run_structured(agent: BaseAgent, prompt: str, parse_error: str | None = None):
    last_error: Exception | None = None
    for model in _model_chain():
        structured_agent = BaseAgent(
            name=agent.name,
            instructions=agent.instructions,
            model=model,
            temperature=agent.temperature,
            max_tokens=agent.max_tokens or MAX_OUTPUT_TOKENS,
            gateway_mode=agent.gateway_mode,
            output_schema=agent.output_schema,
            memory_config=agent.memory_config,
            config=agent.config,
        )
        for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
            try:
                response = await get_runner().run(structured_agent, prompt)
                if response.structured_output is not None:
                    return response.structured_output
                normalized = try_normalize_output(agent.output_schema, response.content)
                if normalized is None:
                    normalized = try_normalize_ai_output(agent.output_schema, response.content)
                if normalized is not None:
                    return normalized
                if response.status == ResponseStatus.ERROR:
                    detail = response.error or response.content or "Agent run failed."
                    if "circuit breaker" in detail.lower():
                        raise LLMServiceUnavailableError(detail)
                    raise RuntimeError(parse_error or "Could not parse the AI response. Please try again.")
                raise RuntimeError(parse_error or "Could not parse the AI response. Please try again.")
            except Exception as exc:
                last_error = exc
                if not _is_retryable(exc):
                    raise
                if attempt < MAX_RATE_LIMIT_RETRIES:
                    wait = _circuit_breaker_wait(exc)
                    await asyncio.sleep(min(wait + 0.5, 65.0))
                    if "circuit breaker" in str(exc).lower():
                        reset_runner()
                    continue
                break
    assert last_error is not None
    raise last_error


def _build_requirements_agent() -> BaseAgent:
    return BaseAgent(
        name="requirements-analyst",
        instructions=REQUIREMENTS_INSTRUCTIONS,
        model=get_default_model(),
        temperature=0.3,
        max_tokens=MAX_OUTPUT_TOKENS,
        output_schema=RequirementAnalysisResult,
        memory_config=AgentMemoryConfig(search_memories=False, store_memories=False),
        config=AgentConfig(input_sanitization=False, max_turns=3),
    )


def _build_drift_agent() -> BaseAgent:
    return BaseAgent(
        name="drift-detector",
        instructions=DRIFT_INSTRUCTIONS,
        model=get_default_model(),
        temperature=0.2,
        max_tokens=MAX_OUTPUT_TOKENS,
        output_schema=DriftAnalysisResult,
        memory_config=AgentMemoryConfig(search_memories=False, store_memories=False),
        config=AgentConfig(input_sanitization=False, max_turns=3),
    )


async def analyze_requirement(requirement: str) -> RequirementAnalysisResult:
    prompt = f"""Analyze this software requirement and produce a full spec plus development tickets.

REQUIREMENT:
{requirement.strip()}
"""
    return await run_structured(
        _build_requirements_agent(),
        prompt,
        "Could not parse the AI response into a spec and tickets. Please try again.",
    )


async def detect_drift(
    spec_text: str,
    tickets_text: str,
    git_activity_text: str,
) -> DriftAnalysisResult:
    prompt = f"""Compare the agreed plan against recent git activity and detect drift.

=== AGREED SPECIFICATION ===
{spec_text}

=== TICKETS ===
{tickets_text}

=== GIT ACTIVITY ===
{git_activity_text}
"""
    return await run_structured(_build_drift_agent(), prompt, "Could not parse drift analysis.")


def format_spec_for_drift(spec) -> str:
    lines = [
        f"Title: {spec.title}",
        f"Overview: {spec.overview}",
        "Goals:",
        *[f"  - {g}" for g in spec.goals],
        "Acceptance Criteria:",
        *[f"  - {a}" for a in spec.acceptance_criteria],
        f"Technical Approach: {spec.technical_approach}",
        "Constraints:",
        *[f"  - {c}" for c in spec.constraints],
    ]
    return "\n".join(lines)


def format_tickets_for_drift(tickets) -> str:
    if not tickets:
        return "No tickets defined."
    blocks: list[str] = []
    for t in tickets:
        blocks.append(
            f"[{t.ticket_type.value.upper()} | {t.priority.value}] {t.title}\n"
            f"  Status: {t.status.value}\n"
            f"  {t.description}\n"
            f"  Acceptance: {', '.join(t.acceptance_criteria)}"
        )
    return "\n\n".join(blocks)


def map_llm_error(exc: Exception) -> tuple[int, str] | None:
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, LLMRateLimitError):
            return (
                429,
                "OpenAI rate limit hit. Wait 30–60 seconds, then retry one feature at a time "
                "(avoid Run Magic if you hit this often).",
            )
        if isinstance(current, LLMAuthenticationError):
            key = api_key_env_name()
            return (401, f"Invalid API key. Check {key} in .env.")
        current = current.__cause__ or getattr(current, "original_error", None)
    message = str(exc).lower()
    if "rate_limit" in message or "quota" in message:
        return (
            429,
            "OpenAI rate limit hit. Wait 30–60 seconds, then retry one feature at a time.",
        )
    if "circuit breaker" in message:
        return (503, "Service recovering from errors. Retry shortly.")
    if "validation error" in message or "could not parse" in message:
        return (422, "The AI response could not be parsed. Please try again.")
    if len(message) > 300:
        return (500, "Analysis failed. Please try again.")
    return None
