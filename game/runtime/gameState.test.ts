import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import {
  createInitialGameState,
  reduceGameState,
  activeQuest,
  nextObjective,
} from '@/game/runtime/gameState';

function setup() {
  const { placed } = buildWorld(RPA_ARCHITECTURE);
  const pack = compileGamePack(placed);
  return { pack, state: createInitialGameState(pack) };
}

describe('Game Runtime', () => {
  it('starts with prerequisite-free quests active and others locked', () => {
    const { pack, state } = setup();
    const arrival = state.quests.find((q) => q.quest_id === 'q_arrival');
    const survey = state.quests.find((q) => q.quest_id === 'q_survey');
    expect(arrival?.status).toBe('active');
    expect(survey?.status).toBe('locked');
    expect(pack.quests.length).toBeGreaterThan(0);
  });

  it('rejects movement onto a non-walkable tile', () => {
    const { pack, state } = setup();
    const blocked = pack.map.colliders[0]!;
    const next = reduceGameState(pack, state, {
      type: 'move',
      position: { x: blocked.min.x, y: blocked.min.y },
      facing: 'north',
    });
    expect(next.player.position).toEqual(state.player.position);
  });

  it('allows movement onto a walkable tile and updates facing', () => {
    const { pack, state } = setup();
    const target = pack.landmarks[0]!.entrance;
    const next = reduceGameState(pack, state, { type: 'move', position: target, facing: 'east' });
    expect(next.player.position).toEqual(target);
    expect(next.player.facing).toBe('east');
  });

  it('completes the arrival quest when talking to the guide', () => {
    const { pack, state } = setup();
    const next = reduceGameState(pack, state, { type: 'talk', npcId: 'npc_guide' });
    const arrival = next.quests.find((q) => q.quest_id === 'q_arrival');
    expect(arrival?.status).toBe('completed');
    expect(next.unlocks).toContain('codex_unlocked');
  });

  it('unlocks the survey quest after arrival completes', () => {
    const { pack, state } = setup();
    const next = reduceGameState(pack, state, { type: 'talk', npcId: 'npc_guide' });
    const survey = next.quests.find((q) => q.quest_id === 'q_survey');
    expect(survey?.status).toBe('active');
  });

  it('reveals codex entries when inspecting a landmark', () => {
    const { pack, state } = setup();
    const landmark = pack.landmarks[0]!;
    const next = reduceGameState(pack, state, { type: 'interact', interactionId: landmark.interaction_id });
    expect(next.codex).toContain(landmark.architecture_entity_id);
  });

  it('completes the survey quest after inspecting every landmark', () => {
    const { pack } = setup();
    let state = createInitialGameState(pack);
    state = reduceGameState(pack, state, { type: 'talk', npcId: 'npc_guide' });
    for (const landmark of pack.landmarks) {
      state = reduceGameState(pack, state, { type: 'interact', interactionId: landmark.interaction_id });
    }
    const survey = state.quests.find((q) => q.quest_id === 'q_survey');
    expect(survey?.status).toBe('completed');
  });

  it('opens and closes dialogue deterministically', () => {
    const { pack, state } = setup();
    const opened = reduceGameState(pack, state, { type: 'talk', npcId: 'npc_guide' });
    expect(opened.dialogue.npc_id).toBe('npc_guide');
    expect(opened.dialogue.node_id).toBe('root');

    const advanced = reduceGameState(pack, opened, { type: 'dialogue_choice', choiceId: 'accept' });
    expect(advanced.dialogue.node_id).toBe('survey');

    const closed = reduceGameState(pack, advanced, { type: 'close_dialogue' });
    expect(closed.dialogue.npc_id).toBeNull();
  });

  it('resets to the initial state', () => {
    const { pack, state } = setup();
    const progressed = reduceGameState(pack, state, { type: 'talk', npcId: 'npc_guide' });
    const reset = reduceGameState(pack, progressed, { type: 'reset' });
    expect(reset).toEqual(createInitialGameState(pack));
  });

  it('exposes the active quest and its next objective', () => {
    const { pack, state } = setup();
    const quest = activeQuest(pack, state);
    expect(quest?.id).toBe('q_arrival');
    const objective = nextObjective(pack, state, 'q_arrival');
    expect(objective?.id).toBe('obj_meet_guide');
  });
});
