"""Architecture Agent — Repository -> Architecture Graph.

Implemented as a LangGraph state machine:

    fetch_context -> extract_graph -> validate_graph -> (repair | finalize)

The graph is validated against the Pydantic contract on every pass. Malformed
model output is rejected and fed back for one repair attempt; if it still fails,
the run fails loudly rather than emitting a broken graph downstream.

The agent NEVER emits coordinates. Spatial meaning is expressed only through
`diagram_region` and semantic `spatial` hints.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from contracts import ArchitectureGraph, RepositoryRef
from provider import get_model

logger = logging.getLogger(__name__)

MAX_REPAIR_ATTEMPTS = 1


SYSTEM_PROMPT = """You are an Architecture Intelligence agent.

Your job: read a software repository and produce a FINAL ARCHITECTURE GRAPH.

You must output ONLY valid JSON matching this exact shape:

{
  "schema_version": "1.0",
  "repository": { "name": str, "branch": str|null, "provider": str|null, "owner": str|null },
  "groups": [
    { "id": str, "label": str, "diagram_region": REGION, "description": str|null }
  ],
  "nodes": [
    {
      "id": str, "label": str, "type": NODE_TYPE,
      "group": str|null, "parent": str|null,
      "metadata": { ... },
      "spatial": { "zone": str|null, "anchor": str|null, "relation": str|null, "placement": str|null } | null,
      "source": { "file": str|null, "symbol": str|null, "line": int|null } | null
    }
  ],
  "edges": [
    { "id": str, "source": str, "target": str, "type": EDGE_TYPE, "label": str|null, "metadata": { ... } }
  ]
}

REGION is one of: center, north, south, east, west, north_east, north_west,
south_east, south_west, far_east, far_west, far_north, far_south.

NODE_TYPE is one of: agent, service, frontend, backend, database, cache, queue,
broker, storage, object_storage, external_service, tool, compute, user, task,
gateway, scheduler, monitor, unknown.

EDGE_TYPE is one of: dependency, data_flow, control_flow, memory, api_call,
event, sync, async, ownership, unknown.

HARD RULES — violating any of these makes your output invalid:

1. NEVER output x, y or z coordinates. Not on nodes, not anywhere.
   Spatial meaning is expressed ONLY through `diagram_region` and `spatial`.
2. Use GENERIC semantic types. A Redis node is type "database", NOT "redis".
   Technology names belong in `metadata`, never in `type`.
3. Every `group` must reference a declared group id, or be null.
4. Every `parent` must reference a declared node id, or be null.
5. Every edge `source` and `target` must reference a declared node id.
6. Node ids must be stable, unique, lowercase snake_case identifiers.
7. `diagram_region` must reflect the architecture diagram's spatial meaning:
   left/right, above/below, grouping, hierarchy and dependency direction.
8. Preserve provenance in `source` whenever the analyzer knows the file/symbol.

Think about the architecture diagram first: which components sit at the centre,
which are upstream/downstream, which are grouped together, and which contain
others. Then encode that as regions, groups and parent relationships.

Output JSON only. No prose, no markdown fences."""


class AgentState(TypedDict, total=False):
    repository: dict[str, Any]
    repository_context: str
    raw_output: str
    architecture: dict[str, Any] | None
    errors: list[str]
    attempts: int
    warnings: list[str]


def _fetch_context(state: AgentState) -> AgentState:
    """Loads repository context.

    In production this calls the existing repository/AI subsystem. For the MVP
    it reads a pre-supplied context blob so the graph can be exercised without
    network access to a code host.
    """
    context = state.get("repository_context") or ""
    if not context:
        repo = state["repository"]
        context = (
            f"Repository: {repo.get('owner', '')}/{repo.get('name', '')} "
            f"(branch: {repo.get('branch', 'main')}).\n"
            "No file contents were supplied. Infer a plausible architecture from "
            "the repository name and branch, and mark uncertain nodes as type "
            "'unknown'."
        )
    return {**state, "repository_context": context, "attempts": 0, "errors": [], "warnings": []}


def _extract_graph(state: AgentState) -> AgentState:
    model = get_model("architecture", temperature=0.0)

    messages: list[Any] = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Repository reference:\n{json.dumps(state['repository'], indent=2)}\n\n"
                f"Repository context:\n{state['repository_context']}\n\n"
                "Produce the final architecture graph JSON."
            )
        ),
    ]

    if state.get("errors"):
        messages.append(
            HumanMessage(
                content=(
                    "Your previous output failed validation with these errors:\n"
                    + "\n".join(f"- {e}" for e in state["errors"])
                    + "\n\nReturn corrected JSON only."
                )
            )
        )

    response = model.invoke(messages)
    content = response.content if isinstance(response.content, str) else str(response.content)

    return {**state, "raw_output": content, "attempts": state.get("attempts", 0) + 1}


def _strip_fences(text: str) -> str:
    """Models sometimes wrap JSON in markdown fences despite instructions."""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped


def _validate_graph(state: AgentState) -> AgentState:
    errors: list[str] = []

    try:
        payload = json.loads(_strip_fences(state["raw_output"]))
    except json.JSONDecodeError as exc:
        return {**state, "architecture": None, "errors": [f"Output is not valid JSON: {exc}"]}

    try:
        graph = ArchitectureGraph.model_validate(payload)
    except ValidationError as exc:
        for issue in exc.errors():
            location = ".".join(str(part) for part in issue["loc"]) or "<root>"
            errors.append(f"{location}: {issue['msg']}")
        return {**state, "architecture": None, "errors": errors}

    structural = graph.structural_errors()
    if structural:
        return {**state, "architecture": None, "errors": structural}

    return {**state, "architecture": graph.model_dump(), "errors": []}


def _route_after_validation(state: AgentState) -> Literal["repair", "finalize"]:
    if state.get("architecture") is not None:
        return "finalize"
    if state.get("attempts", 0) <= MAX_REPAIR_ATTEMPTS:
        return "repair"
    return "finalize"


def _finalize(state: AgentState) -> AgentState:
    if state.get("architecture") is None:
        raise ValueError(
            "Architecture Agent failed to produce a valid graph after "
            f"{state.get('attempts', 0)} attempt(s):\n  - "
            + "\n  - ".join(state.get("errors", ["unknown error"]))
        )
    return state


def build_architecture_agent():
    """Compiles the LangGraph state machine."""
    graph = StateGraph(AgentState)

    graph.add_node("fetch_context", _fetch_context)
    graph.add_node("extract_graph", _extract_graph)
    graph.add_node("validate_graph", _validate_graph)
    graph.add_node("finalize", _finalize)

    graph.set_entry_point("fetch_context")
    graph.add_edge("fetch_context", "extract_graph")
    graph.add_edge("extract_graph", "validate_graph")
    graph.add_conditional_edges(
        "validate_graph",
        _route_after_validation,
        {"repair": "extract_graph", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    return graph.compile()


def analyze_repository(
    repository: RepositoryRef,
    repository_context: str | None = None,
) -> ArchitectureGraph:
    """Runs the agent and returns a validated Architecture Graph."""
    agent = build_architecture_agent()

    result = agent.invoke(
        {
            "repository": repository.model_dump(),
            "repository_context": repository_context or "",
        }
    )

    return ArchitectureGraph.model_validate(result["architecture"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    repo = RepositoryRef(
        provider="github",
        owner=os.getenv("DEMO_OWNER", "anshumanNitk"),
        name=os.getenv("DEMO_REPO", "Robotic-Process-Automation"),
        branch=os.getenv("DEMO_BRANCH", "procedure"),
    )
    print(analyze_repository(repo).model_dump_json(indent=2))
