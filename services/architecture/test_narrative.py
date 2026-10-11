"""Tests for the narrative contracts and their grounding validator.

The critical property under test: a narrative that references a component which
does not exist in the architecture MUST be rejected. This is what stops the
story from inventing parts of the repository.
"""

from __future__ import annotations

from contracts import (
    ArchitectureGraph,
    Character,
    Cutscene,
    CutsceneLine,
    Mission,
    MissionObjective,
    NarrativeGraph,
    StoryBeat,
)


def _architecture() -> ArchitectureGraph:
    return ArchitectureGraph.model_validate(
        {
            "schema_version": "1.0",
            "repository": {"name": "rpa-agent", "owner": "anshumanNitk"},
            "groups": [{"id": "agent", "label": "Agent Control", "diagram_region": "center"}],
            "nodes": [
                {"id": "rpa_agent", "label": "RPA Agent", "type": "agent", "group": "agent"},
                {"id": "redis", "label": "Redis", "type": "database", "group": "agent"},
            ],
            "edges": [
                {"id": "e1", "source": "rpa_agent", "target": "redis", "type": "memory"},
            ],
        }
    )


def _valid_narrative() -> NarrativeGraph:
    return NarrativeGraph(
        world_id="rpa-agent",
        premise="A realm where procedures are remembered.",
        central_conflict="The Archive is losing its memories.",
        learning_promise="Understand how the agent stores and recalls procedures.",
        characters=[
            Character(
                id="guide",
                name="The Guide",
                role="guide",
                architecture_node_id="rpa_agent",
                backstory="Keeps the realm's memory of every task.",
                motivation="Wants the player to understand the flow.",
                greeting="Welcome, traveller.",
                facts=["The RPA Agent coordinates every task."],
            ),
            Character(
                id="archivist",
                name="The Archivist",
                role="archivist",
                architecture_node_id="redis",
                backstory="Guards the memory vault.",
                motivation="Wants the memories preserved.",
                greeting="Mind the shelves.",
                facts=["Redis stores the procedures."],
            ),
        ],
        beats=[
            StoryBeat(id="b_arrival", kind="arrival", title="Arrival", summary="Enter the realm.", mission_ids=["m_meet"], prerequisites=[]),
            StoryBeat(id="b_learn", kind="learn", title="Learning", summary="Understand memory.", mission_ids=["m_archive"], prerequisites=["b_arrival"]),
        ],
        missions=[
            Mission(
                id="m_meet",
                title="Meet the Guide",
                kind="main",
                beat_id="b_arrival",
                hook="Someone is waiting for you.",
                stakes="Learn who keeps this realm.",
                objectives=[MissionObjective(id="o1", text="Speak with the Guide.", kind="talk", npc_id="npc_guide", architecture_node_id="rpa_agent")],
                prerequisites=[],
                concepts=["agent"],
                giver_id="guide",
                intro_cutscene_id="cs_prologue",
            ),
            Mission(
                id="m_archive",
                title="The Memory Vault",
                kind="main",
                beat_id="b_learn",
                hook="The Archive is failing.",
                stakes="Understand how procedures are stored.",
                objectives=[MissionObjective(id="o2", text="Inspect the Archive.", kind="inspect", landmark_id="landmark_redis", architecture_node_id="redis")],
                prerequisites=["m_meet"],
                concepts=["database"],
                giver_id="archivist",
            ),
        ],
        cutscenes=[
            Cutscene(
                id="cs_prologue",
                title="Prologue",
                beat_id="b_arrival",
                lines=[
                    CutsceneLine(speaker_id=None, text="The realm stirs."),
                    CutsceneLine(speaker_id="guide", text="You have arrived."),
                ],
            )
        ],
        prologue_cutscene_id="cs_prologue",
        finale_mission_id="m_archive",
    )


def test_valid_narrative_passes() -> None:
    narrative = _valid_narrative()
    assert narrative.structural_errors(_architecture()) == []


def test_character_must_reference_real_node() -> None:
    narrative = _valid_narrative()
    narrative.characters[0].architecture_node_id = "does_not_exist"
    errors = narrative.structural_errors(_architecture())
    assert any("unknown architecture node" in e for e in errors)


def test_objective_must_reference_real_node() -> None:
    narrative = _valid_narrative()
    narrative.missions[1].objectives[0].architecture_node_id = "ghost"
    errors = narrative.structural_errors(_architecture())
    assert any("unknown architecture node" in e for e in errors)


def test_unknown_beat_reference_is_rejected() -> None:
    narrative = _valid_narrative()
    narrative.missions[0].beat_id = "nope"
    errors = narrative.structural_errors(_architecture())
    assert any("unknown beat" in e for e in errors)


def test_unknown_prerequisite_is_rejected() -> None:
    narrative = _valid_narrative()
    narrative.missions[1].prerequisites = ["missing_mission"]
    errors = narrative.structural_errors(_architecture())
    assert any("unknown prerequisite" in e for e in errors)


def test_mission_cycle_is_rejected() -> None:
    narrative = _valid_narrative()
    narrative.missions[0].prerequisites = ["m_archive"]
    errors = narrative.structural_errors(_architecture())
    assert any("cycle" in e for e in errors)


def test_unknown_speaker_is_rejected() -> None:
    narrative = _valid_narrative()
    narrative.cutscenes[0].lines[1].speaker_id = "ghost"
    errors = narrative.structural_errors(_architecture())
    assert any("unknown speaker" in e for e in errors)


def test_unknown_finale_is_rejected() -> None:
    narrative = _valid_narrative()
    narrative.finale_mission_id = "nope"
    errors = narrative.structural_errors(_architecture())
    assert any("finale" in e for e in errors)


def test_duplicate_ids_are_rejected() -> None:
    narrative = _valid_narrative()
    narrative.characters.append(narrative.characters[0].model_copy())
    errors = narrative.structural_errors(_architecture())
    assert any("Duplicate character id" in e for e in errors)


# --- Deterministic cycle repair -------------------------------------------------
#
# The model is asked for a DAG but sometimes emits a cycle. Rather than spend a
# slow model round-trip, the agent breaks the cycle in-process. These tests pin
# that behaviour: a cyclic story is repaired, not rejected.

from narrative_agent import _break_mission_cycles


def test_break_mission_cycles_removes_a_two_node_cycle() -> None:
    payload = {
        "missions": [
            {"id": "m_a", "prerequisites": ["m_b"]},
            {"id": "m_b", "prerequisites": ["m_a"]},
        ]
    }
    notes = _break_mission_cycles(payload)
    assert notes, "expected the cycle to be reported"
    # At least one edge must be gone, leaving an acyclic graph.
    remaining = {m["id"]: m["prerequisites"] for m in payload["missions"]}
    assert not (remaining["m_a"] and remaining["m_b"])


def test_break_mission_cycles_removes_a_three_node_cycle() -> None:
    payload = {
        "missions": [
            {"id": "m_a", "prerequisites": ["m_c"]},
            {"id": "m_b", "prerequisites": ["m_a"]},
            {"id": "m_c", "prerequisites": ["m_b"]},
        ]
    }
    _break_mission_cycles(payload)
    prereqs = {m["id"]: m["prerequisites"] for m in payload["missions"]}

    def reaches(start: str, target: str, seen: set[str]) -> bool:
        if start == target:
            return True
        if start in seen:
            return False
        seen.add(start)
        return any(reaches(p, target, seen) for p in prereqs.get(start, []))

    # A cycle exists iff some prerequisite of a mission reaches back to it.
    for mid, deps in prereqs.items():
        for dep in deps:
            assert not reaches(dep, mid, set()), f"cycle still present at {mid}"


def test_break_mission_cycles_leaves_a_valid_dag_untouched() -> None:
    payload = {
        "missions": [
            {"id": "m_a", "prerequisites": []},
            {"id": "m_b", "prerequisites": ["m_a"]},
            {"id": "m_c", "prerequisites": ["m_b"]},
        ]
    }
    notes = _break_mission_cycles(payload)
    assert notes == []
    assert payload["missions"][2]["prerequisites"] == ["m_b"]


def test_break_mission_cycles_handles_missing_fields() -> None:
    payload = {"missions": [{"id": "m_a"}, {"id": "m_b", "prerequisites": None}]}
    assert _break_mission_cycles(payload) == []


def test_diamond_dag_is_not_a_cycle() -> None:
    """A diamond (A->B, A->C, B->D, C->D) is a valid DAG, not a cycle.

    The old detector flagged any node reached twice, so it rejected every
    diamond. This pins the fix.
    """
    narrative = _valid_narrative()
    # Build a diamond: m_arrival -> {m_archive, m_guide} -> m_finale.
    narrative.missions[0].prerequisites = []
    narrative.missions[1].prerequisites = ["m_arrival"]
    narrative.missions.append(
        Mission(
            id="m_guide",
            title="Meet the Guide",
            kind="side",
            beat_id=narrative.beats[0].id,
            hook="Find the guide.",
            stakes="Learn the flow.",
            objectives=[
                MissionObjective(id="o_guide", text="Talk to the guide.", kind="talk", npc_id="guide")
            ],
            prerequisites=["m_arrival"],
        )
    )
    narrative.missions.append(
        Mission(
            id="m_finale",
            title="The Reckoning",
            kind="finale",
            beat_id=narrative.beats[0].id,
            hook="Finish it.",
            stakes="Understand the whole.",
            objectives=[
                MissionObjective(
                    id="o_finale", text="Reach the agent.", kind="visit", architecture_node_id="rpa_agent"
                )
            ],
            prerequisites=["m_archive", "m_guide"],
        )
    )
    errors = narrative.structural_errors(_architecture())
    assert not any("cycle" in e for e in errors), errors


def test_real_cycle_is_still_detected() -> None:
    narrative = _valid_narrative()
    narrative.missions[0].prerequisites = ["m_archive"]
    errors = narrative.structural_errors(_architecture())
    assert any("cycle" in e for e in errors)
