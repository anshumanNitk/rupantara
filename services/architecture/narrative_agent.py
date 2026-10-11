"""Narrative Agent — Architecture Graph -> Narrative Graph.

Implemented as a LangGraph state machine:

    build_brief -> write_story -> validate_story -> (repair | finalize)

This is the "soul" layer. It turns a repository's architecture into a story the
player can feel: characters with backstories, a sequence of story beats,
missions, cutscenes and an ending.

THE INVARIANT
-------------
The narrative is a DETERMINISTIC INTERPRETATION of the architecture. The agent
may invent names, prose, backstories and flavour — but it may NOT invent
components. Every character and every mission objective must reference a real
architecture node id. `NarrativeGraph.structural_errors()` enforces this, and
the repair loop feeds violations back to the model.

The model is deliberately a fast one (claude-haiku-5.5): writing is creative and
high-volume, and the grounding validator — not the model — guarantees the story
cannot corrupt the world.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from contracts import ArchitectureGraph, NarrativeGraph
from provider import get_model

logger = logging.getLogger(__name__)

MAX_REPAIR_ATTEMPTS = 2


SYSTEM_PROMPT = """You are a Narrative Director for an educational RPG.

A player is about to explore a software repository as a living world. Your job
is to give that world a SOUL: a story with characters, stakes, missions and an
ending that leaves the player genuinely understanding how the repository works.

You will receive an ARCHITECTURE GRAPH: the real components of the repository
(groups, nodes, edges) with their semantic types and provenance.

WHAT YOU MUST PRODUCE
---------------------
A single JSON object with this exact shape:

{
  "schema_version": "1.0",
  "world_id": str,
  "premise": str,                 // one paragraph the player reads on arrival
  "central_conflict": str,        // the tension the story resolves
  "learning_promise": str,        // what the player will understand by the end
  "characters": [
    {
      "id": str,                  // snake_case, stable
      "name": str,                // a memorable name
      "role": ROLE,
      "architecture_node_id": str,// MUST be a real node id from the graph
      "title": str|null,
      "backstory": str,           // 2-4 sentences, why they exist
      "motivation": str,          // what they want
      "greeting": str,            // one line when first met
      "facts": [str],             // 2-5 grounded facts they may state
      "portrait_prompt": str|null // image-gen prompt for a portrait
    }
  ],
  "beats": [
    {
      "id": str, "kind": BEAT_KIND, "title": str, "summary": str,
      "mission_ids": [str], "prerequisites": [str]
    }
  ],
  "missions": [
    {
      "id": str, "title": str, "kind": MISSION_KIND, "beat_id": str,
      "hook": str,                // one-line hook for the mission brief
      "stakes": str,              // why this matters to understanding the repo
      "objectives": [
        {
          "id": str, "text": str, "kind": OBJECTIVE_KIND,
          "landmark_id": str|null, "npc_id": str|null,
          "architecture_node_id": str|null
        }
      ],
      "prerequisites": [str],
      "concepts": [str],
      "giver_id": str|null,
      "intro_cutscene_id": str|null,
      "outro_cutscene_id": str|null
    }
  ],
  "cutscenes": [
    {
      "id": str, "title": str, "beat_id": str|null,
      "lines": [ { "speaker_id": str|null, "text": str, "direction": str|null } ]
    }
  ],
  "prologue_cutscene_id": str|null,
  "epilogue_cutscene_id": str|null,
  "finale_mission_id": str|null
}

ROLE is one of: guide, mentor, guardian, artisan, archivist, messenger,
sentinel, villain, ally.

BEAT_KIND is one of: prologue, arrival, meet, learn, conflict, resolve, reveal,
climax, epilogue.

MISSION_KIND is one of: main, side, trial, finale.

OBJECTIVE_KIND is one of: visit, inspect, talk, collect, unlock.

HARD RULES — violating any of these makes your output invalid:

1. GROUNDING. Every `character.architecture_node_id` MUST be an id that appears
   in the architecture graph's `nodes`. Never invent a component.
2. Every mission objective that concerns a component MUST set
   `architecture_node_id` to a real node id.
3. `landmark_id` and `npc_id` may be null. When set, use the convention
   `landmark_<node_id>` and `npc_<node_id>` (or `npc_guide` for the guide).
4. Every `beat_id`, `mission_ids`, `prerequisites`, `giver_id`, cutscene id and
   speaker id MUST reference something you declared in this same output.
5. Mission prerequisites must form a DAG (no cycles).
6. The story must have a clear arc: prologue -> arrival -> learn -> conflict ->
   resolve -> climax -> epilogue. Not every beat needs a mission, but the
   sequence must be coherent.
7. The FINALE mission must require understanding the repository's entry point or
   its most central component.
8. `learning_promise` must describe real understanding of THIS repository, not
   generic fantasy.

STORYTELLING GUIDANCE
---------------------
- The repository's components ARE the world's places and people. A database is
  an Archive; an agent is a Guild Hall; a queue is a Dispatch Depot. Use the
  semantic types to choose roles, but never name a technology as a character.
- Give the central tension a real basis: a missing link, a fragile dependency,
  a component everything relies on, a flow that must not break.
- Characters should feel like they belong to this world, not generic NPCs.
- Missions should escalate: understand a piece -> understand how pieces connect
  -> understand the whole.
- Cutscenes should be short (3-8 lines) and reveal something each time.
- The epilogue must pay off the learning promise: the player should feel they
  now understand the repository end to end.

Output JSON only. No prose, no markdown fences."""


class NarrativeState(TypedDict, total=False):
    architecture: dict[str, Any]
    world_id: str
    theme: str
    brief: str
    raw_output: str
    narrative: dict[str, Any] | None
    errors: list[str]
    attempts: int
    warnings: list[str]


def _build_brief(state: NarrativeState) -> NarrativeState:
    """Distils the architecture into a compact, model-friendly brief.

    Only the information the writer needs: node ids, labels, semantic types,
    groups and the edge topology. No coordinates, no source code.
    """
    arch = ArchitectureGraph.model_validate(state["architecture"])

    groups = {g.id: g.label for g in arch.groups}
    lines: list[str] = [
        f"Repository: {arch.repository.owner or ''}/{arch.repository.name}".strip("/"),
        f"World id: {state.get('world_id') or arch.repository.name}",
    ]
    if state.get("theme"):
        lines.append(f"Theme: {state['theme']}")

    lines.append("")
    lines.append("Components (nodes):")
    for node in arch.nodes:
        group = groups.get(node.group or "", "ungrouped")
        parent = f", parent={node.parent}" if node.parent else ""
        lines.append(f"  - id={node.id} | label={node.label} | type={node.type} | group={group}{parent}")

    lines.append("")
    lines.append("Relationships (edges):")
    for edge in arch.edges:
        label = f" ({edge.label})" if edge.label else ""
        lines.append(f"  - {edge.source} --{edge.type}--> {edge.target}{label}")

    # Entry-point hint: the node with the most outgoing edges is usually central.
    out_degree: dict[str, int] = {}
    in_degree: dict[str, int] = {}
    for edge in arch.edges:
        out_degree[edge.source] = out_degree.get(edge.source, 0) + 1
        in_degree[edge.target] = in_degree.get(edge.target, 0) + 1
    if out_degree:
        hub = max(out_degree, key=lambda k: out_degree[k])
        lines.append("")
        lines.append(f"Most central component (most outgoing links): {hub}")

    return {**state, "brief": "\n".join(lines), "attempts": 0, "errors": [], "warnings": []}


def _write_story(state: NarrativeState) -> NarrativeState:
    model = get_model("narrative", temperature=0.7)

    messages: list[Any] = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Architecture brief:\n\n{state['brief']}\n\n"
                "Write the narrative graph JSON."
            )
        ),
    ]

    if state.get("errors"):
        messages.append(
            HumanMessage(
                content=(
                    "Your previous output failed validation with these errors:\n"
                    + "\n".join(f"- {e}" for e in state["errors"])
                    + "\n\nReturn corrected JSON only. Keep the story, fix the references."
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


def _validate_story(state: NarrativeState) -> NarrativeState:
    errors: list[str] = []

    try:
        payload = json.loads(_strip_fences(state["raw_output"]))
    except json.JSONDecodeError as exc:
        return {**state, "narrative": None, "errors": [f"Output is not valid JSON: {exc}"]}

    try:
        narrative = NarrativeGraph.model_validate(payload)
    except ValidationError as exc:
        for issue in exc.errors():
            location = ".".join(str(part) for part in issue["loc"]) or "<root>"
            errors.append(f"{location}: {issue['msg']}")
        return {**state, "narrative": None, "errors": errors}

    architecture = ArchitectureGraph.model_validate(state["architecture"])
    structural = narrative.structural_errors(architecture)
    if structural:
        return {**state, "narrative": None, "errors": structural}

    return {**state, "narrative": narrative.model_dump(), "errors": []}


def _route_after_validation(state: NarrativeState) -> Literal["repair", "finalize"]:
    if state.get("narrative") is not None:
        return "finalize"
    if state.get("attempts", 0) <= MAX_REPAIR_ATTEMPTS:
        return "repair"
    return "finalize"


def _finalize(state: NarrativeState) -> NarrativeState:
    if state.get("narrative") is None:
        raise ValueError(
            "Narrative Agent failed to produce a valid story after "
            f"{state.get('attempts', 0)} attempt(s):\n  - "
            + "\n  - ".join(state.get("errors", ["unknown error"]))
        )
    return state


def build_narrative_agent():
    """Compiles the LangGraph state machine."""
    graph = StateGraph(NarrativeState)

    graph.add_node("build_brief", _build_brief)
    graph.add_node("write_story", _write_story)
    graph.add_node("validate_story", _validate_story)
    graph.add_node("finalize", _finalize)

    graph.set_entry_point("build_brief")
    graph.add_edge("build_brief", "write_story")
    graph.add_edge("write_story", "validate_story")
    graph.add_conditional_edges(
        "validate_story",
        _route_after_validation,
        {"repair": "write_story", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    return graph.compile()


def write_narrative(
    architecture: ArchitectureGraph,
    world_id: str | None = None,
    theme: str | None = None,
) -> tuple[NarrativeGraph, list[str]]:
    """Runs the agent and returns a validated Narrative Graph plus warnings."""
    agent = build_narrative_agent()

    result = agent.invoke(
        {
            "architecture": architecture.model_dump(),
            "world_id": world_id or architecture.repository.name,
            "theme": theme or "",
        }
    )

    narrative = NarrativeGraph.model_validate(result["narrative"])
    return narrative, list(result.get("warnings", []))
