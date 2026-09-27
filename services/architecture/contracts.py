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


class SpatialHint(BaseModel):
    """Semantic placement. Never coordinates."""

    zone: str | None = None
    anchor: str | None = None
    relation: Literal["dependency", "containment", "sibling", "flow"] | None = None
    placement: Literal["center", "near_parent", "inside_parent", "adjacent", "orbit"] | None = None


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


class ArchitectureEdge(BaseModel):
    id: str
    source: str
    target: str
    type: EdgeType
    label: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


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
