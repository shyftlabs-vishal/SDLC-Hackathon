"""LLM provider selection and configuration for SDLC Conductor."""

from __future__ import annotations

import os
from enum import Enum
from typing import Literal, TypedDict

ProviderName = Literal["OPENAI", "GEMINI", "AURA"]


class LLMProvider(str, Enum):
    OPENAI = "OPENAI"
    GEMINI = "GEMINI"
    AURA = "AURA"


_PROVIDER_DEFAULTS: dict[LLMProvider, dict[str, object]] = {
    LLMProvider.OPENAI: {
        "model": "gpt-3.5-turbo",
        "fallbacks": ("gpt-3.5-turbo-1106",),
        "key_env": "OPENAI_API_KEY",
        "key_label": "OPENAI_API_KEY",
    },
    LLMProvider.GEMINI: {
        "model": "gemini/gemini-2.5-flash",
        "fallbacks": ("gemini/gemini-2.0-flash",),
        "key_env": "GEMINI_API_KEY",
        "key_label": "GEMINI_API_KEY",
    },
    LLMProvider.AURA: {
        # Pin a fast, non-thinking model with a large output window. The gateway's
        # "auto/cheap" tier routes to a thinking model that over-generates on large
        # structured specs and truncates (400) or times out (504).
        "model": "anthropic/claude-haiku-4-5-20251001",
        "fallbacks": ("auto/quality",),
        "key_env": "SMART_GATEWAY_API_KEY",
        "url_env": "SMART_GATEWAY_URL",
        "key_label": "SMART_GATEWAY_URL and SMART_GATEWAY_API_KEY",
    },
}


def get_provider() -> LLMProvider:
    raw = os.getenv("LLM_PROVIDER", "OPENAI").strip().upper()
    try:
        return LLMProvider(raw)
    except ValueError:
        supported = ", ".join(p.value for p in LLMProvider)
        raise ValueError(
            f"Invalid LLM_PROVIDER '{raw}'. Supported values: {supported}"
        )


def _provider_settings(provider: LLMProvider) -> dict[str, object]:
    return _PROVIDER_DEFAULTS[provider]


def get_default_model(provider: LLMProvider | None = None) -> str:
    p = provider or get_provider()
    override = os.getenv("DEFAULT_LLM_MODEL", "").strip()
    if override:
        return override
    return str(_provider_settings(p)["model"])


def get_fallback_models(provider: LLMProvider | None = None) -> tuple[str, ...]:
    p = provider or get_provider()
    extra = os.getenv("LLM_FALLBACK_MODELS", "").strip()
    if extra:
        return tuple(m.strip() for m in extra.split(",") if m.strip())
    return tuple(_provider_settings(p)["fallbacks"])  # type: ignore[return-value]


def get_model_chain(provider: LLMProvider | None = None) -> list[str]:
    chain: list[str] = []
    for model in (get_default_model(provider), *get_fallback_models(provider)):
        if model not in chain:
            chain.append(model)
    return chain


def is_api_key_configured(provider: LLMProvider | None = None) -> bool:
    p = provider or get_provider()
    settings = _provider_settings(p)
    key_env = str(settings["key_env"])
    if not os.getenv(key_env, "").strip():
        return False
    url_env = settings.get("url_env")
    if url_env and not os.getenv(str(url_env), "").strip():
        return False
    return True


def require_api_key(provider: LLMProvider | None = None) -> None:
    p = provider or get_provider()
    if not is_api_key_configured(p):
        key_label = str(_provider_settings(p)["key_label"])
        raise RuntimeError(
            f"{key_label} is not set. Add it to backend/.env for LLM_PROVIDER={p.value}."
        )


def api_key_env_name(provider: LLMProvider | None = None) -> str:
    p = provider or get_provider()
    return str(_provider_settings(p)["key_label"])


class LLMStatus(TypedDict):
    llm_provider: ProviderName
    llm_configured: bool
    default_model: str
    openai_configured: bool
    gemini_configured: bool
    aura_configured: bool


def llm_status() -> LLMStatus:
    provider = get_provider()
    return {
        "llm_provider": provider.value,
        "llm_configured": is_api_key_configured(provider),
        "default_model": get_default_model(provider),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY", "").strip()),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "aura_configured": is_api_key_configured(LLMProvider.AURA),
    }
