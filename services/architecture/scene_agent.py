"""Scene Agent — Placed World Specification + Scene SDK -> Scene Program.

Implemented as a LangGraph state machine:

    build_prompt -> generate_scene -> validate_scene -> (repair | finalize)

The agent composes ONLY Scene SDK components. It may not inspect repository
source, invent entities or relationships, or modify architecture truth. The
World Specification is authoritative.

Generated code is never executed here. It is validated statically and handed to
the sandbox pipeline.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from provider import get_model
from scene_validator import SceneValidationResult, validate_scene_code

logger = logging.getLogger(__name__)

MAX_REPAIR_ATTEMPTS = 2


SCENE_SDK_DOC = """# Scene SDK

You may ONLY use the components below. Anything else is invalid.

## Buildings (props: position, rotation, scale, state, color, metadata, onSelect)
OfficeBuilding, OfficeTower, AgentControlCenter, DataCenter, Warehouse,
DistributionCenter, Factory, Workshop, Airport, ControlTower, TargetApplication

## People
Person, RequestEntity

## Vehicles (extra props: path, animated, durationMs, loop)
Car, Truck, RobotWorker, Airplane

## Connections (props: path, color, width, opacity, animated)
Road, Bridge, AirRoute, Pipe, Beam, DataRoute

## Effects (props: position, color, durationMs, scale)
PulseEffect, SuccessEffect, FailureEffect, ParticleEffect

## Labels (props: position, text, color, size, offsetY)
Label

## Behaviors (props: entityId, path, durationMs, loop, onComplete, children)
MoveAlongPath, MoveAlongArc, Pulse, Spawn, Enter, Exit, Orbit

## Position type
{ x: number, y: number, z: number }
"""


SYSTEM_PROMPT = f"""You are the Scene Compiler Agent.

You turn a PLACED WORLD SPECIFICATION into a React Three Fiber scene program.

{SCENE_SDK_DOC}

OUTPUT FORMAT — a single TSX module, nothing else:

```tsx
import {{ /* only SDK components you use */ }} from '@/scene-sdk';
import type {{ PlacedWorld }} from '@/world/schemas/world';

export default function GeneratedScene({{ world }}: {{ world: PlacedWorld }}) {{
  return (
    <>
      {/* compose the scene here */}
    </>
  );
}}
```

HARD RULES — violating any of these makes your output invalid:

1. The World Specification is AUTHORITATIVE. Render exactly the entities and
   connections it contains. Never invent, rename, merge or drop them.
2. Read positions from `world.entities.<id>.resolved_position`. Never hardcode
   coordinates.
3. Read connection paths from `world.connections`. Never invent routes.
4. Import ONLY from '@/scene-sdk' and '@/world/schemas/world'.
5. NEVER use: eval, new Function, require, import(), fetch, XMLHttpRequest,
   process, fs, path, child_process, os, net, http, https, crypto, worker_threads.
6. NEVER access environment variables, secrets, databases or the filesystem.
7. NEVER use Next.js server APIs (next/headers, next/server, server-only).
8. No dynamic imports, no dynamic code execution, no network requests.
9. Use `world.entities` and `world.connections` — do not assume specific ids
   exist. Iterate or guard with optional chaining.
10. Keep it deterministic: no Math.random(), no Date.now() in layout decisions.

You MAY choose visual presentation: colours, labels, decorative effects,
animation composition and camera framing. You may NOT change architecture truth.

Output the TSX module only. No prose, no explanation."""


class SceneState(TypedDict, total=False):
    placed_world: dict[str, Any]
    visual_style: dict[str, Any]
    raw_output: str
    scene_code: str | None
    errors: list[str]
    attempts: int


def _build_prompt(state: SceneState) -> SceneState:
    return {**state, "attempts": 0, "errors": []}


def _generate_scene(state: SceneState) -> SceneState:
    model = get_model("scene", temperature=0.0)

    # Only the placed world is sent — never repository source.
    world_json = json.dumps(state["placed_world"], indent=2)
    style_json = json.dumps(state.get("visual_style", {}), indent=2)

    messages: list[Any] = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Visual style configuration:\n{style_json}\n\n"
                f"Placed World Specification:\n{world_json}\n\n"
                "Produce the scene program."
            )
        ),
    ]

    if state.get("errors"):
        messages.append(
            HumanMessage(
                content=(
                    "Your previous output failed validation:\n"
                    + "\n".join(f"- {e}" for e in state["errors"])
                    + "\n\nReturn corrected TSX only."
                )
            )
        )

    response = model.invoke(messages)
    content = response.content if isinstance(response.content, str) else str(response.content)

    return {**state, "raw_output": content, "attempts": state.get("attempts", 0) + 1}


def _strip_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped


def _validate_scene(state: SceneState) -> SceneState:
    code = _strip_fences(state["raw_output"])
    result: SceneValidationResult = validate_scene_code(code)

    if not result.ok:
        return {**state, "scene_code": None, "errors": result.errors}

    return {**state, "scene_code": code, "errors": []}


def _route_after_validation(state: SceneState) -> Literal["repair", "finalize"]:
    if state.get("scene_code") is not None:
        return "finalize"
    if state.get("attempts", 0) <= MAX_REPAIR_ATTEMPTS:
        return "repair"
    return "finalize"


def _finalize(state: SceneState) -> SceneState:
    if state.get("scene_code") is None:
        raise ValueError(
            "Scene Agent failed to produce valid scene code after "
            f"{state.get('attempts', 0)} attempt(s):\n  - "
            + "\n  - ".join(state.get("errors", ["unknown error"]))
        )
    return state


def build_scene_agent():
    graph = StateGraph(SceneState)

    graph.add_node("build_prompt", _build_prompt)
    graph.add_node("generate_scene", _generate_scene)
    graph.add_node("validate_scene", _validate_scene)
    graph.add_node("finalize", _finalize)

    graph.set_entry_point("build_prompt")
    graph.add_edge("build_prompt", "generate_scene")
    graph.add_edge("generate_scene", "validate_scene")
    graph.add_conditional_edges(
        "validate_scene",
        _route_after_validation,
        {"repair": "generate_scene", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    return graph.compile()


def generate_scene(
    placed_world: dict[str, Any],
    visual_style: dict[str, Any] | None = None,
) -> str:
    """Runs the agent and returns validated scene code."""
    agent = build_scene_agent()
    result = agent.invoke(
        {
            "placed_world": placed_world,
            "visual_style": visual_style or {},
        }
    )
    return result["scene_code"]
