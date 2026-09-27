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
