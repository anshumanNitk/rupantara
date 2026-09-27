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

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from architecture_agent import analyze_repository
from contracts import AnalyzeRequest, AnalyzeResponse, ArchitectureGraph
from scene_agent import generate_scene
from scene_validator import validate_scene_code

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Architecture Intelligence",
    description="Repository -> Architecture Graph, and Placed World -> Scene Program.",
    version="0.1.0",
)


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/projects/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Repository -> Architecture Graph.

    The graph is validated against the contract before it leaves this service.
    """
    try:
        architecture: ArchitectureGraph = analyze_repository(request.repository)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 502
        logger.exception("Architecture analysis failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return AnalyzeResponse(architecture=architecture)


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
