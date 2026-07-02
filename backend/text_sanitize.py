"""Clean up AI-generated text: dedupe, trim truncation, polish blockers."""

from __future__ import annotations

import re

from schemas import StandupBlocker, StandupDigestResult


def dedupe_clause(text: str) -> str:
    """Remove duplicated clauses often produced by Gemini (A — A...)."""
    text = text.strip()
    if not text:
        return text

    if " — " in text:
        left, _, right = text.partition(" — ")
        left_s, right_s = left.strip(), right.strip()
        if left_s and right_s:
            if right_s.startswith(left_s[: min(40, len(left_s))]):
                return right_s
            if left_s.startswith(right_s[: min(40, len(right_s))]):
                return left_s
            if left_s.lower() == right_s.lower():
                return left_s

    sentences = re.split(r"(?<=[.!?])\s+", text)
    deduped: list[str] = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if deduped and s.lower()[:60] == deduped[-1].lower()[:60]:
            continue
        deduped.append(s)
    return " ".join(deduped)


def _trim_incomplete_tail(text: str) -> str:
    """Drop a trailing fragment that doesn't end a sentence."""
    text = text.strip()
    if not text:
        return text
    if text[-1] in ".!?\"":
        return text

    matches = list(re.finditer(r"[.!?](?:\s|$)", text))
    if matches and matches[-1].start() > len(text) * 0.4:
        return text[: matches[-1].end()].strip()

    # No complete sentence — drop trailing clause after last comma/em-dash
    for sep in (", ", " — ", "; "):
        if sep in text:
            head, _ = text.rsplit(sep, 1)
            if len(head) > len(text) * 0.45:
                head = head.rstrip(",;— ")
                return head + ("" if head[-1] in ".!?" else ".")

    # Drop common dangling fragments (model stopped mid-phrase)
    trimmed = re.sub(
        r"\s+(?:which is|being|awaiting|likely awaiting|a great)\s+.*$",
        "",
        text,
        flags=re.I,
    )
    if trimmed != text and len(trimmed) > 20:
        return trimmed.rstrip() + ("" if trimmed[-1] in ".!?" else ".")

    return text


def _short_title(title: str, description: str, ticket_title: str | None) -> str:
    if ticket_title:
        return ticket_title[:120]
    if title and title != description and len(title) < 120:
        return title
    first = re.split(r"[.!?]", description)[0].strip()
    if len(first) > 100:
        first = first[:97] + "..."
    return first or "Blocker"


def _blocker_description(title: str, description: str) -> str:
    desc = dedupe_clause(description)
    title_clean = title.strip()
    if not desc:
        return "Needs attention."

    # Strip boilerplate that repeats the title: The feature 'X' is blocked, ...
    boilerplate = re.match(
        r"^The feature ['\"](.+?)['\"] is blocked,?\s*(.*)$",
        desc,
        flags=re.I,
    )
    if boilerplate:
        feature, rest = boilerplate.group(1), boilerplate.group(2).strip()
        if feature.lower() == title_clean.lower() or title_clean.lower() in feature.lower():
            desc = rest or "Blocked on a dependency."

    if desc.lower().startswith(title_clean.lower()):
        rest = desc[len(title_clean) :].lstrip(" —:-.")
        if rest:
            desc = rest

    if title_clean and title_clean.lower() == desc.lower():
        return "Blocked on a dependency."

    return desc


def polish_blocker(blocker: StandupBlocker) -> StandupBlocker:
    desc = dedupe_clause(blocker.description)
    title = _short_title(blocker.title, desc, blocker.ticket_title)
    desc = _blocker_description(title, desc)
    return StandupBlocker(
        title=title,
        description=desc,
        ticket_title=blocker.ticket_title,
        severity=blocker.severity,
    )


def polish_standup(result: StandupDigestResult) -> StandupDigestResult:
    script = _trim_incomplete_tail(dedupe_clause(result.standup_script))
    slack = _trim_incomplete_tail(dedupe_clause(result.slack_message))
    blockers = [polish_blocker(b) for b in result.blockers]
    wins = [dedupe_clause(w) for w in result.wins if w.strip()]
    return StandupDigestResult(
        headline=dedupe_clause(result.headline),
        summary=_trim_incomplete_tail(dedupe_clause(result.summary)),
        wins=wins,
        blockers=blockers,
        today_suggestions=result.today_suggestions,
        per_person_updates=result.per_person_updates,
        standup_script=script,
        slack_message=slack,
    )
