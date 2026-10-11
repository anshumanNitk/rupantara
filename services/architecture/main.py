"""FastAPI boundary for Architecture Intelligence.

Conceptual API surface (adapters, not a rewrite of the existing app):

    POST /projects/:id/analyze          -> Architecture Graph
    POST /projects/:id/scene/generate   -> Scene Program
    POST /projects/:id/scene/validate   -> validation result

The Next.js app owns world compilation, layout and rendering. This service owns
repository analysis and scene composition only.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from architecture_agent import analyze_repository, analyze_repository_url
from contracts import (
    AnalyzeRequest,
    AnalyzeResponse,
    ArchitectureGraph,
    NarrativeRequest,
    NarrativeResponse,
)
from dialogue_agent import generate_reply
from narrative_agent import write_narrative
from repo_fetcher import RateLimitError, RepositoryFetchError, parse_repo_url
from scene_agent import generate_scene
from scene_validator import validate_scene_code

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Architecture Intelligence",
    description="Repository -> Architecture Graph, and Placed World -> Scene Program.",
    version="0.1.0",
)

# The Next.js dev server and any local preview origin.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class AnalyzeUrlRequest(BaseModel):
    """Analyze a public repository by URL or `owner/name` shorthand."""

    url: str = Field(..., description="GitHub URL or owner/name shorthand")
    branch: str | None = Field(default=None, description="Optional branch override")


class SceneGenerateRequest(BaseModel):
    placed_world: dict = Field(..., description="Placed World Specification")
    visual_style: dict = Field(default_factory=dict)


class SceneGenerateResponse(BaseModel):
    scene_code: str
    warnings: list[str] = Field(default_factory=list)


class SceneValidateRequest(BaseModel):
    scene_code: str


class SceneValidateResponse(BaseModel):
    ok: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DialogueTurn(BaseModel):
    role: Literal["npc", "player"]
    text: str


class DialogueRequest(BaseModel):
    """One grounded NPC conversation turn."""

    name: str
    world_name: str = "the realm"
    persona: str | None = None
    motivation: str | None = None
    facts: list[str] = Field(default_factory=list)
    history: list[DialogueTurn] = Field(default_factory=list)


class DialogueResponse(BaseModel):
    text: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/github/rate-limit")
def github_rate_limit() -> dict[str, object]:
    """Reports the current GitHub API quota.

    Useful for diagnosing 403s: shows whether a token is configured and how many
    requests remain before the limit resets.
    """
    import os

    import httpx

    authenticated = bool(os.getenv("GITHUB_TOKEN", "").strip())
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "architecture-to-3d-world"}
    if authenticated:
        headers["Authorization"] = f"Bearer {os.getenv('GITHUB_TOKEN', '').strip()}"

    try:
        response = httpx.get("https://api.github.com/rate_limit", headers=headers, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        core = payload.get("resources", {}).get("core", {})
        return {
            "authenticated": authenticated,
            "limit": core.get("limit"),
            "remaining": core.get("remaining"),
            "reset": core.get("reset"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"authenticated": authenticated, "error": str(exc)}


@app.post("/projects/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Repository -> Architecture Graph.

    The graph is validated against the contract before it leaves this service.
    """
    try:
        architecture, warnings = analyze_repository(request.repository)
    except RateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 502
        logger.exception("Architecture analysis failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return AnalyzeResponse(architecture=architecture, warnings=warnings)


@app.post("/projects/analyze-url", response_model=AnalyzeResponse)
def analyze_url(request: AnalyzeUrlRequest) -> AnalyzeResponse:
    """Analyze a public repository from a pasted URL.

    This is the endpoint the frontend uses. It fetches the real repository
    structure and key files, then runs the Architecture Agent over them.
    """
    try:
        ref = parse_repo_url(request.url)
    except RepositoryFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if request.branch:
        ref.branch = request.branch

    try:
        architecture, warnings = analyze_repository_url(request.url)
    except RateLimitError as exc:
        # 429 tells the client this is transient and retryable after a wait.
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except RepositoryFetchError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Architecture analysis failed for %s", request.url)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return AnalyzeResponse(architecture=architecture, warnings=warnings)


@app.post("/projects/narrative/generate", response_model=NarrativeResponse)
def narrative_generate(request: NarrativeRequest) -> NarrativeResponse:
    """Architecture Graph -> Narrative Graph.

    The story is validated against the architecture it claims to explain before
    it leaves this service: every character and mission must reference a real
    component. The agent may invent prose, never components.
    """
    try:
        narrative, warnings = write_narrative(
            request.architecture,
            world_id=request.world_id,
            theme=request.theme,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 502
        logger.exception("Narrative generation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return NarrativeResponse(narrative=narrative, warnings=warnings)


@app.post("/projects/dialogue/generate", response_model=DialogueResponse)
def dialogue_generate(request: DialogueRequest) -> DialogueResponse:
    """One grounded NPC conversation turn.

    The caller supplies the NPC's persona and the facts it is allowed to state.
    The model writes prose only; it cannot invent components, and player input is
    treated as untrusted.
    """
    try:
        text = generate_reply(
            name=request.name,
            persona=request.persona,
            motivation=request.motivation,
            facts=request.facts,
            world_name=request.world_name,
            history=[turn.model_dump() for turn in request.history],
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 502
        logger.exception("Dialogue generation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return DialogueResponse(text=text)


@app.post("/projects/scene/generate", response_model=SceneGenerateResponse)
def scene_generate(request: SceneGenerateRequest) -> SceneGenerateResponse:
    """Placed World Specification + Scene SDK -> Scene Program.

    The generated code is statically validated before being returned. It is
    never executed in this process.
    """
    try:
        code = generate_scene(request.placed_world, request.visual_style)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scene generation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = validate_scene_code(code)
    return SceneGenerateResponse(scene_code=code, warnings=result.warnings)


@app.post("/projects/scene/validate", response_model=SceneValidateResponse)
def scene_validate(request: SceneValidateRequest) -> SceneValidateResponse:
    """Static validation only. Safe to call on untrusted code."""
    result = validate_scene_code(request.scene_code)
    return SceneValidateResponse(ok=result.ok, errors=result.errors, warnings=result.warnings)
