"""Pydantic mirrors of the TypeScript contracts.

These are the wire contracts between the Python Architecture Intelligence
service and the Next.js visualization runtime. They must stay in sync with
`world/schemas/*.ts`.

The critical invariant: the Architecture Graph carries NO coordinates. Spatial
meaning is expressed only through `diagram_region` and semantic `spatial` hints.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

DiagramRegion = Literal[
    "center",
    "north",
    "south",
    "east",
    "west",
    "north_east",
    "north_west",
    "south_east",
    "south_west",
    "far_east",
    "far_west",
    "far_north",
    "far_south",
]

NodeType = Literal[
    "agent",
    "service",
    "frontend",
    "backend",
    "database",
    "cache",
    "queue",
    "broker",
    "storage",
    "object_storage",
    "external_service",
    "tool",
    "compute",
    "user",
    "task",
    "gateway",
    "scheduler",
    "monitor",
    "unknown",
]

EdgeType = Literal[
    "dependency",
    "data_flow",
    "control_flow",
    "memory",
    "api_call",
    "event",
    "sync",
    "async",
    "ownership",
    "unknown",
]


class SourceRef(BaseModel):
    """Provenance back to the repository."""

    file: str | None = None
    symbol: str | None = None
    line: int | None = None


# --- Spatial hint normalisation ---------------------------------------------
#
# `spatial` is ADVISORY: it refines layout but the layout engine already has
# robust fallbacks (zone regions, parent anchoring, collision resolution). It
# must therefore degrade gracefully rather than fail the whole analysis.
#
# Contrast with STRUCTURAL fields — `type`, `group`, `parent`, edge endpoints —
# which must stay strict, because a bad value silently corrupts the world.
#
# Models reliably produce descriptive prose here ("downstream of WSGI entry
# point") even when the schema asks for an enum. Rejecting that wasted a full
# repair round-trip (~150s) and then failed the request. Instead we map known
# synonyms to canonical values and drop anything unrecognised.

_RELATION_SYNONYMS: dict[str, str] = {
    "dependency": "dependency",
    "depends": "dependency",
    "depends_on": "dependency",
    "containment": "containment",
    "contains": "containment",
    "contained_by": "containment",
    "sibling": "sibling",
    "flow": "flow",
    "data_flow": "flow",
    "control_flow": "flow",
}

_PLACEMENT_SYNONYMS: dict[str, str] = {
    "center": "center",
    "centre": "center",
    "near_parent": "near_parent",
    "near": "near_parent",
    "beside_parent": "near_parent",
    "inside_parent": "inside_parent",
    "inside": "inside_parent",
    "adjacent": "adjacent",
    "parallel": "adjacent",
    "orbit": "orbit",
    "surrounding": "orbit",
}


def _normalize_choice(value: object, synonyms: dict[str, str]) -> str | None:
    """Maps free-form model prose onto a canonical value, or None."""
    if not isinstance(value, str):
        return None

    key = value.strip().lower().replace(" ", "_").replace("-", "_")
    if not key:
        return None

    if key in synonyms:
        return synonyms[key]

    # The prose often embeds the keyword ("upstream_of_parent", "flow_to_db").
    for canonical in dict.fromkeys(synonyms.values()):
        if canonical in key:
            return canonical

    return None


class SpatialHint(BaseModel):
    """Semantic placement. Never coordinates.

    Tolerant by design — see the note above. Unrecognised values normalise to
    None rather than raising, so a verbose or sloppy model cannot fail the
    entire run over an optional hint.

    Validators run in `mode="before"` so a non-string (number, list, dict) is
    coerced to None instead of failing type validation.
    """

    zone: str | None = None
    anchor: str | None = None
    relation: str | None = None
    placement: str | None = None

    @field_validator("relation", mode="before")
    @classmethod
    def _normalize_relation(cls, value: object) -> str | None:
        return _normalize_choice(value, _RELATION_SYNONYMS)

    @field_validator("placement", mode="before")
    @classmethod
    def _normalize_placement(cls, value: object) -> str | None:
        return _normalize_choice(value, _PLACEMENT_SYNONYMS)


def _coerce_metadata(value: object) -> dict[str, Any]:
    """Normalises a metadata field to a dict.

    Models routinely emit `"metadata": null` for nodes and edges that need no
    extra detail. A bare `dict[str, Any]` rejects None, so two out of three real
    runs failed validation on exactly this — costing a full repair round-trip
    and often surfacing as a 502.

    `metadata` is descriptive, never structural, so coercing junk to `{}` is
    safe: it cannot change entity identity, grouping or topology.
    """
    if isinstance(value, dict):
        return value
    if value is None:
        return {}
    # A model may emit a string or list by mistake; wrap it rather than fail.
    if isinstance(value, (str, list, tuple, int, float, bool)):
        return {"value": value}
    return {}


class ArchitectureGroup(BaseModel):
    id: str
    label: str
    diagram_region: DiagramRegion
    description: str | None = None


class ArchitectureNode(BaseModel):
    id: str
    label: str
    type: NodeType
    group: str | None = None
    parent: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    spatial: SpatialHint | None = None
    source: SourceRef | None = None

    @field_validator("id", "label")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        return value

    @field_validator("metadata", mode="before")
    @classmethod
    def _normalize_metadata(cls, value: object) -> dict[str, Any]:
        return _coerce_metadata(value)


class ArchitectureEdge(BaseModel):
    id: str
    source: str
    target: str
    type: EdgeType
    label: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata", mode="before")
    @classmethod
    def _normalize_metadata(cls, value: object) -> dict[str, Any]:
        return _coerce_metadata(value)


class RepositoryRef(BaseModel):
    name: str
    branch: str | None = None
    provider: str | None = None
    owner: str | None = None


class ArchitectureGraph(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    repository: RepositoryRef
    groups: list[ArchitectureGroup] = Field(default_factory=list)
    nodes: list[ArchitectureNode]
    edges: list[ArchitectureEdge] = Field(default_factory=list)

    def structural_errors(self) -> list[str]:
        """Referential integrity checks that Pydantic cannot express."""
        errors: list[str] = []

        group_ids = {g.id for g in self.groups}
        node_ids: set[str] = set()

        for node in self.nodes:
            if node.id in node_ids:
                errors.append(f"Duplicate node id: {node.id}")
            node_ids.add(node.id)

        for node in self.nodes:
            if node.group is not None and node.group not in group_ids:
                errors.append(f'Node "{node.id}" references unknown group "{node.group}"')
            if node.parent is not None and node.parent not in node_ids:
                errors.append(f'Node "{node.id}" references unknown parent "{node.parent}"')
            if node.parent == node.id:
                errors.append(f'Node "{node.id}" is its own parent')

        for edge in self.edges:
            if edge.source not in node_ids:
                errors.append(f'Edge "{edge.id}" has unknown source "{edge.source}"')
            if edge.target not in node_ids:
                errors.append(f'Edge "{edge.id}" has unknown target "{edge.target}"')

        parent_of = {n.id: n.parent for n in self.nodes}
        for node in self.nodes:
            seen = {node.id}
            cursor = parent_of.get(node.id)
            while cursor is not None:
                if cursor in seen:
                    errors.append(f'Parent cycle detected involving node "{node.id}"')
                    break
                seen.add(cursor)
                cursor = parent_of.get(cursor)

        return errors


class AnalyzeRequest(BaseModel):
    repository: RepositoryRef


class AnalyzeResponse(BaseModel):
    architecture: ArchitectureGraph
    warnings: list[str] = Field(default_factory=list)


# ============================================================================
# Narrative contracts — the "soul" layer.
#
# The Narrative Agent turns an Architecture Graph into a story: characters with
# backstories, a sequence of story beats, missions, cutscenes and an ending.
#
# CRITICAL INVARIANT: narrative is a DETERMINISTIC INTERPRETATION of the
# architecture. Every character and mission must reference a real architecture
# node id. The agent may invent flavour, names and prose, but it may NOT invent
# components. `NarrativeGraph.structural_errors()` enforces this.
# ============================================================================

NarrativeRole = Literal[
    "guide",       # introduces the world and the goal
    "mentor",      # teaches a concept
    "guardian",    # blocks progress until understood
    "artisan",     # embodies a tool / compute component
    "archivist",   # embodies storage / memory
    "messenger",   # embodies queues / brokers / events
    "sentinel",    # embodies monitors / schedulers
    "villain",     # embodies the central tension / failure mode
    "ally",        # supports the player
]

BeatKind = Literal[
    "prologue",    # opening cutscene
    "arrival",     # enter the world
    "meet",        # meet a character
    "learn",       # understand a component
    "conflict",    # a problem appears
    "resolve",     # the problem is addressed
    "reveal",      # a key insight
    "climax",      # the central confrontation
    "epilogue",    # closing cutscene
]

MissionKind = Literal["main", "side", "trial", "finale"]


class Character(BaseModel):
    """A named inhabitant of the world, grounded in an architecture node."""

    id: str
    name: str
    role: NarrativeRole
    # The architecture node this character embodies. MUST exist in the graph.
    architecture_node_id: str
    title: str | None = None
    backstory: str
    motivation: str
    # Short line shown when the player first meets them.
    greeting: str
    # Facts the character may state. Grounded in the architecture; used to
    # constrain future LLM dialogue so it cannot invent components.
    facts: list[str] = Field(default_factory=list)
    portrait_prompt: str | None = None


class CutsceneLine(BaseModel):
    speaker_id: str | None = None  # None = narrator
    text: str
    # Optional stage direction for the renderer (e.g. "camera pans east").
    direction: str | None = None


class Cutscene(BaseModel):
    id: str
    title: str
    lines: list[CutsceneLine] = Field(default_factory=list)
    # Beat this cutscene belongs to, if any.
    beat_id: str | None = None


class MissionObjective(BaseModel):
    id: str
    text: str
    kind: Literal["visit", "inspect", "talk", "collect", "unlock"]
    # Target ids. At least one must be set and must resolve.
    landmark_id: str | None = None
    npc_id: str | None = None
    architecture_node_id: str | None = None


class Mission(BaseModel):
    id: str
    title: str
    kind: MissionKind
    # The story beat this mission advances.
    beat_id: str
    # One-line hook shown in the mission brief.
    hook: str
    # Why this matters to the player's understanding of the repository.
    stakes: str
    objectives: list[MissionObjective] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    # Architecture concepts this mission teaches.
    concepts: list[str] = Field(default_factory=list)
    # Character who briefs the mission.
    giver_id: str | None = None
    # Cutscene played when the mission is accepted / completed.
    intro_cutscene_id: str | None = None
    outro_cutscene_id: str | None = None


class StoryBeat(BaseModel):
    id: str
    kind: BeatKind
    title: str
    summary: str
    # Missions that make up this beat.
    mission_ids: list[str] = Field(default_factory=list)
    # Beats that must complete first (forms a DAG).
    prerequisites: list[str] = Field(default_factory=list)


class NarrativeGraph(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    # The world this story belongs to.
    world_id: str
    # One-paragraph premise the player reads on arrival.
    premise: str
    # The central tension the story resolves.
    central_conflict: str
    # What the player should understand by the end.
    learning_promise: str
    characters: list[Character] = Field(default_factory=list)
    beats: list[StoryBeat] = Field(default_factory=list)
    missions: list[Mission] = Field(default_factory=list)
    cutscenes: list[Cutscene] = Field(default_factory=list)
    # Cutscene played on first load.
    prologue_cutscene_id: str | None = None
    # Cutscene played when the final mission completes.
    epilogue_cutscene_id: str | None = None
    # The mission that ends the game.
    finale_mission_id: str | None = None

    def structural_errors(self, architecture: ArchitectureGraph) -> list[str]:
        """Validates the narrative against the architecture it claims to explain.

        This is the guardrail that keeps the story honest: every character and
        mission must point at a real architecture node, and every internal
        reference must resolve.
        """
        errors: list[str] = []

        node_ids = {n.id for n in architecture.nodes}
        char_ids = {c.id for c in self.characters}
        beat_ids = {b.id for b in self.beats}
        mission_ids = {m.id for m in self.missions}
        cutscene_ids = {c.id for c in self.cutscenes}

        def dup(label: str, ids: list[str]) -> None:
            seen: set[str] = set()
            for i in ids:
                if i in seen:
                    errors.append(f"Duplicate {label} id: {i}")
                seen.add(i)

        dup("character", [c.id for c in self.characters])
        dup("beat", [b.id for b in self.beats])
        dup("mission", [m.id for m in self.missions])
        dup("cutscene", [c.id for c in self.cutscenes])

        # Characters must embody a real architecture node.
        for c in self.characters:
            if c.architecture_node_id not in node_ids:
                errors.append(
                    f'Character "{c.id}" references unknown architecture node '
                    f'"{c.architecture_node_id}"'
                )

        # Beats: prerequisites resolve, no cycles.
        for b in self.beats:
            for p in b.prerequisites:
                if p not in beat_ids:
                    errors.append(f'Beat "{b.id}" references unknown prerequisite "{p}"')
            for mid in b.mission_ids:
                if mid not in mission_ids:
                    errors.append(f'Beat "{b.id}" references unknown mission "{mid}"')

        # Missions: references resolve, prerequisites resolve, no cycles.
        for m in self.missions:
            if m.beat_id not in beat_ids:
                errors.append(f'Mission "{m.id}" references unknown beat "{m.beat_id}"')
            for p in m.prerequisites:
                if p not in mission_ids:
                    errors.append(f'Mission "{m.id}" references unknown prerequisite "{p}"')
            if m.giver_id is not None and m.giver_id not in char_ids:
                errors.append(f'Mission "{m.id}" references unknown giver "{m.giver_id}"')
            if m.intro_cutscene_id is not None and m.intro_cutscene_id not in cutscene_ids:
                errors.append(f'Mission "{m.id}" references unknown intro cutscene "{m.intro_cutscene_id}"')
            if m.outro_cutscene_id is not None and m.outro_cutscene_id not in cutscene_ids:
                errors.append(f'Mission "{m.id}" references unknown outro cutscene "{m.outro_cutscene_id}"')
            for o in m.objectives:
                if o.architecture_node_id is not None and o.architecture_node_id not in node_ids:
                    errors.append(
                        f'Objective "{o.id}" references unknown architecture node '
                        f'"{o.architecture_node_id}"'
                    )

        # Cutscenes: speakers resolve.
        for c in self.cutscenes:
            for line in c.lines:
                if line.speaker_id is not None and line.speaker_id not in char_ids:
                    errors.append(f'Cutscene "{c.id}" line references unknown speaker "{line.speaker_id}"')

        # Top-level references.
        if self.prologue_cutscene_id is not None and self.prologue_cutscene_id not in cutscene_ids:
            errors.append(f"Unknown prologue cutscene: {self.prologue_cutscene_id}")
        if self.epilogue_cutscene_id is not None and self.epilogue_cutscene_id not in cutscene_ids:
            errors.append(f"Unknown epilogue cutscene: {self.epilogue_cutscene_id}")
        if self.finale_mission_id is not None and self.finale_mission_id not in mission_ids:
            errors.append(f"Unknown finale mission: {self.finale_mission_id}")

        # Mission prerequisite cycles.
        prereqs = {m.id: m.prerequisites for m in self.missions}
        for m in self.missions:
            seen = {m.id}
            stack = list(m.prerequisites)
            while stack:
                cur = stack.pop()
                if cur in seen:
                    errors.append(f'Mission cycle detected involving "{m.id}"')
                    break
                seen.add(cur)
                stack.extend(prereqs.get(cur, []))

        return errors


class NarrativeRequest(BaseModel):
    """Architecture Graph -> Narrative Graph."""

    architecture: ArchitectureGraph
    # Optional world id override; defaults to the repository name.
    world_id: str | None = None
    # Optional theme hint so the story matches the visual theme.
    theme: str | None = None


class NarrativeResponse(BaseModel):
    narrative: NarrativeGraph
    warnings: list[str] = Field(default_factory=list)
