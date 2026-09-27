"""Tests for the Architecture Graph contract.

Focus areas:
  - STRUCTURAL fields stay strict (bad values would corrupt the world).
  - ADVISORY `spatial` hints normalise instead of failing the whole analysis.

Regression context: `relation` and `placement` were restricted Literals while
the prompt described them as free text. Models wrote descriptive prose, Pydantic
rejected it, and a full repair round-trip (~150s) still produced invalid output,
surfacing to the user as a 502 after ~306s.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from contracts import (
    ArchitectureGraph,
    ArchitectureNode,
    SpatialHint,
    _normalize_choice,
    _PLACEMENT_SYNONYMS,
    _RELATION_SYNONYMS,
)


# --- spatial normalisation --------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("dependency", "dependency"),
        ("DEPENDENCY", "dependency"),
        (" depends_on ", "dependency"),
        ("containment", "containment"),
        ("sibling", "sibling"),
        ("flow", "flow"),
        ("data_flow", "flow"),
        ("control_flow", "flow"),
    ],
)
def test_relation_normalises_known_values(raw: str, expected: str) -> None:
    assert SpatialHint(relation=raw).relation == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("center", "center"),
        ("Centre", "center"),
        ("near_parent", "near_parent"),
        ("inside_parent", "inside_parent"),
        ("adjacent", "adjacent"),
        ("orbit", "orbit"),
    ],
)
def test_placement_normalises_known_values(raw: str, expected: str) -> None:
    assert SpatialHint(placement=raw).placement == expected


def test_verbose_prose_does_not_fail_validation() -> None:
    """The exact shapes that previously broke the pipeline."""
    hint = SpatialHint(
        zone="north",
        anchor="downstream of WSGI entry point",
        relation="upstream of WSGI entry point",
        placement="outside the system boundary, top-left",
    )
    # Unknown prose is dropped, not raised.
    assert hint.relation is None
    assert hint.placement is None
    # Other fields survive untouched.
    assert hint.zone == "north"
    assert hint.anchor == "downstream of WSGI entry point"


def test_prose_containing_a_keyword_still_normalises() -> None:
    """Descriptive values often embed the canonical keyword."""
    assert SpatialHint(relation="dependency_on_redis").relation == "dependency"
    assert SpatialHint(placement="near_parent_top_left").placement == "near_parent"


@pytest.mark.parametrize("value", [None, "", "   ", "totally unrelated text", 42, []])
def test_unusable_values_normalise_to_none(value: object) -> None:
    assert SpatialHint(relation=value).relation is None
    assert SpatialHint(placement=value).placement is None


def test_normalize_choice_handles_separators() -> None:
    assert _normalize_choice("Near-Parent", _PLACEMENT_SYNONYMS) == "near_parent"
    assert _normalize_choice("data flow", _RELATION_SYNONYMS) == "flow"


def test_spatial_hint_defaults_to_all_none() -> None:
    hint = SpatialHint()
    assert (hint.zone, hint.anchor, hint.relation, hint.placement) == (None, None, None, None)


# --- metadata tolerance -----------------------------------------------------
#
# Regression context: models emit `"metadata": null` for nodes and edges that
# need no extra detail. A bare `dict[str, Any]` rejects None, so two of three
# real runs failed validation on exactly this field, costing a repair
# round-trip and often surfacing as a 502.


@pytest.mark.parametrize("value", [None, "some string", ["a", "b"], 42, True])
def test_node_metadata_coerces_to_dict(value: object) -> None:
    node = ArchitectureNode(id="a", label="A", type="backend", metadata=value)
    assert isinstance(node.metadata, dict)


@pytest.mark.parametrize("value", [None, "some string", ["a"], 7])
def test_edge_metadata_coerces_to_dict(value: object) -> None:
    from contracts import ArchitectureEdge

    edge = ArchitectureEdge(id="e", source="a", target="b", type="dependency", metadata=value)
    assert isinstance(edge.metadata, dict)


def test_null_metadata_becomes_empty_dict() -> None:
    node = ArchitectureNode(id="a", label="A", type="backend", metadata=None)
    assert node.metadata == {}


def test_real_metadata_is_preserved() -> None:
    node = ArchitectureNode(
        id="a", label="A", type="backend", metadata={"framework": "Django", "apps": ["authen"]}
    )
    assert node.metadata == {"framework": "Django", "apps": ["authen"]}


def test_graph_with_null_metadata_everywhere_validates() -> None:
    """The exact shape that broke two of three real runs."""
    graph = _graph(
        nodes=[
            {"id": "a", "label": "A", "type": "backend", "group": "core", "parent": None,
             "metadata": None, "spatial": None, "source": None},
            {"id": "b", "label": "B", "type": "backend", "group": "core", "parent": None,
             "metadata": None, "spatial": None, "source": None},
        ],
        edges=[
            {"id": "e1", "source": "a", "target": "b", "type": "dependency",
             "label": None, "metadata": None},
        ],
    )
    assert graph.nodes[0].metadata == {}
    assert graph.edges[0].metadata == {}
    assert graph.structural_errors() == []


# --- structural fields stay strict ------------------------------------------


def test_node_rejects_unknown_semantic_type() -> None:
    """A bad `type` would silently map to a fallback primitive, so it is strict."""
    with pytest.raises(ValidationError):
        ArchitectureNode(id="a", label="A", type="not_a_real_type")


def test_node_accepts_null_group_and_parent() -> None:
    node = ArchitectureNode(id="a", label="A", type="backend", group=None, parent=None)
    assert node.group is None
    assert node.parent is None


# --- graph-level integrity --------------------------------------------------


def _graph(**overrides: object) -> ArchitectureGraph:
    base: dict[str, object] = {
        "repository": {"name": "demo", "branch": "main", "provider": "github", "owner": "acme"},
        "groups": [{"id": "core", "label": "Core", "diagram_region": "center"}],
        "nodes": [
            {"id": "a", "label": "A", "type": "backend", "group": "core", "parent": None,
             "metadata": {}, "spatial": None, "source": None},
            {"id": "b", "label": "B", "type": "backend", "group": "core", "parent": None,
             "metadata": {}, "spatial": None, "source": None},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b", "type": "dependency",
             "label": None, "metadata": {}},
        ],
    }
    base.update(overrides)
    return ArchitectureGraph.model_validate(base)


def test_accepts_a_python_style_graph_with_explicit_nulls() -> None:
    """Pydantic serialises absent values as null; the TS side must cope too."""
    graph = _graph()
    assert graph.repository.branch == "main"
    assert graph.nodes[0].source is None
    assert graph.structural_errors() == []


def test_detects_unknown_group_reference() -> None:
    graph = _graph(nodes=[{"id": "a", "label": "A", "type": "backend", "group": "ghost",
                           "parent": None, "metadata": {}, "spatial": None, "source": None}],
                   edges=[])
    errors = graph.structural_errors()
    assert any("ghost" in e for e in errors)


def test_detects_edge_pointing_at_missing_node() -> None:
    graph = _graph(edges=[{"id": "e1", "source": "a", "target": "nope",
                           "type": "dependency", "label": None, "metadata": {}}])
    errors = graph.structural_errors()
    assert any("nope" in e for e in errors)


def test_detects_parent_cycle() -> None:
    graph = _graph(
        nodes=[
            {"id": "a", "label": "A", "type": "backend", "group": "core", "parent": "b",
             "metadata": {}, "spatial": None, "source": None},
            {"id": "b", "label": "B", "type": "backend", "group": "core", "parent": "a",
             "metadata": {}, "spatial": None, "source": None},
        ],
        edges=[],
    )
    errors = graph.structural_errors()
    assert any("cycle" in e for e in errors)


def test_detects_duplicate_node_ids() -> None:
    graph = _graph(
        nodes=[
            {"id": "a", "label": "A", "type": "backend", "group": "core", "parent": None,
             "metadata": {}, "spatial": None, "source": None},
            {"id": "a", "label": "A again", "type": "backend", "group": "core", "parent": None,
             "metadata": {}, "spatial": None, "source": None},
        ],
        edges=[],
    )
    errors = graph.structural_errors()
    assert any("Duplicate" in e for e in errors)
