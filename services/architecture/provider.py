"""OpenRouter model provider.

All agents use OpenRouter through its OpenAI-compatible endpoint. Keeping the
provider in one module means swapping models is a config change, never a code
change.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# Load the repository-root .env so the service picks up OPENROUTER_API_KEY and
# GITHUB_TOKEN without requiring the caller to export them manually.
# Existing environment variables always win (load_dotenv does not override).
for candidate in (
    Path(__file__).resolve().parents[2] / ".env",
    Path(__file__).resolve().parent / ".env",
):
    if candidate.is_file():
        load_dotenv(candidate, override=False)

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_ARCHITECTURE_MODEL = "anthropic/claude-sonnet-4"
DEFAULT_SCENE_MODEL = "anthropic/claude-sonnet-4"


class MissingApiKeyError(RuntimeError):
    """Raised when OPENROUTER_API_KEY is not configured."""


def _require_api_key() -> str:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise MissingApiKeyError(
            "OPENROUTER_API_KEY is not set. Configure it in the service environment."
        )
    return key


def _default_headers() -> dict[str, str]:
    """Optional attribution headers OpenRouter uses for dashboard analytics."""
    headers: dict[str, str] = {}
    site_url = os.getenv("OPENROUTER_SITE_URL", "").strip()
    app_name = os.getenv("OPENROUTER_APP_NAME", "").strip()
    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name
    return headers


@lru_cache(maxsize=4)
def get_model(role: str = "architecture", temperature: float = 0.0) -> ChatOpenAI:
    """Returns a chat model for the given agent role.

    `temperature=0.0` by default: architecture extraction and scene composition
    must be as reproducible as the model allows.
    """
    if role == "scene":
        model_name = os.getenv("OPENROUTER_SCENE_MODEL", DEFAULT_SCENE_MODEL)
    else:
        model_name = os.getenv("OPENROUTER_ARCHITECTURE_MODEL", DEFAULT_ARCHITECTURE_MODEL)

    return ChatOpenAI(
        model=model_name,
        api_key=_require_api_key(),
        base_url=os.getenv("OPENROUTER_BASE_URL", DEFAULT_BASE_URL),
        temperature=temperature,
        default_headers=_default_headers(),
        timeout=120,
        max_retries=2,
    )
