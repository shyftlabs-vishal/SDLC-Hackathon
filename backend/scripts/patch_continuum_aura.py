#!/usr/bin/env python3
"""Apply Aura gateway model-pin fix to local continuum-main checkout.

Upstream GatewayProvider rewrites explicit "<provider>/<model>" pins to
auto/{tier}, which breaks pinned fast models for structured-output agents.
This patch is idempotent and safe to run on every start.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = (
    ROOT
    / "continuum-main"
    / "src"
    / "continuum"
    / "llm"
    / "providers"
    / "gateway_provider.py"
)

MARKER = "Explicit provider/model pin"
OLD_SNIPPET = '''    def _normalize_model(self, model: str) -> str:
        # Already in gateway auto-routing format — pass through unchanged.
        if model.startswith("auto/"):
            return model
        # Everything else (single-segment or provider-qualified like
        # "gemini/gemini-2.5-flash") gets routed by the gateway.
        tier = _MODE_TO_TIER.get(self._router_mode, "mid")
        return f"auto/{tier}"
'''

NEW_SNIPPET = '''    def _normalize_model(self, model: str) -> str:
        # Bare "auto" → resolve to the tier for the current router mode.
        if model == "auto":
            tier = _MODE_TO_TIER.get(self._router_mode, "mid")
            return f"auto/{tier}"
        # Already in gateway auto-routing format ("auto/<tier>") — pass through.
        if model.startswith("auto/"):
            return model
        # Explicit provider/model pin (e.g. "anthropic/claude-haiku-4-5-...").
        # Per the gateway model-namespace grammar, a "<provider>/<model_id>" pin
        # bypasses model selection — honor it instead of forcing auto-routing.
        if "/" in model:
            return model
        # Bare single-segment name (no provider, not "auto") → route by tier.
        tier = _MODE_TO_TIER.get(self._router_mode, "mid")
        return f"auto/{tier}"
'''


def main() -> int:
    if not TARGET.exists():
        print(f"continuum-main not found at {TARGET.parents[4]} — skip Aura patch")
        return 0

    text = TARGET.read_text(encoding="utf-8")
    if MARKER in text:
        return 0
    if OLD_SNIPPET not in text:
        print("Aura gateway patch: unexpected gateway_provider.py — skipped", file=sys.stderr)
        return 0

    TARGET.write_text(text.replace(OLD_SNIPPET, NEW_SNIPPET), encoding="utf-8")
    print("Applied Aura gateway model-pin patch to continuum-main")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
