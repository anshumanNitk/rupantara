import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { validateGamePack } from '@/game/compiler/validators';

function rpaPack() {
  return compileGamePack(buildWorld(RPA_ARCHITECTURE).placed);
}

describe('Narrative layer', () => {
  it('always produces a narrative, even without the agent', () => {
    const pack = rpaPack();
    expect(pack.narrative).toBeTruthy();
    expect(pack.narrative!.characters.length).toBeGreaterThan(0);
    expect(pack.narrative!.missions.length).toBeGreaterThan(0);
    expect(pack.narrative!.cutscenes.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same world', () => {
    const a = rpaPack();
    const b = rpaPack();
    expect(a.narrative).toEqual(b.narrative);
  });

  it('grounds every character in a real architecture node', () => {
    const pack = rpaPack();
    const nodeIds = new Set(pack.landmarks.map((l) => l.architecture_entity_id));
    for (const character of pack.narrative!.characters) {
      expect(nodeIds.has(character.architecture_node_id)).toBe(true);
    }
  });

  it('grounds every mission objective in a real landmark or NPC', () => {
    const pack = rpaPack();
    const landmarkIds = new Set(pack.landmarks.map((l) => l.id));
    const npcIds = new Set(pack.npcs.map((n) => n.id));
    for (const mission of pack.narrative!.missions) {
      for (const objective of mission.objectives) {
        if (objective.landmark_id != null) expect(landmarkIds.has(objective.landmark_id)).toBe(true);
        if (objective.npc_id != null) expect(npcIds.has(objective.npc_id)).toBe(true);
      }
    }
  });

  it('has a coherent arc with a prologue, a finale and an epilogue', () => {
    const pack = rpaPack();
    const narrative = pack.narrative!;
    expect(narrative.prologue_cutscene_id).toBeTruthy();
    expect(narrative.finale_mission_id).toBeTruthy();
    expect(narrative.epilogue_cutscene_id).toBeTruthy();
    expect(narrative.beats.some((b) => b.kind === 'climax')).toBe(true);
  });

  it('passes the full pack validator including narrative grounding', () => {
    const pack = rpaPack();
    expect(validateGamePack(pack)).toEqual([]);
  });

  it('rejects a narrative that references a non-existent landmark', () => {
    const pack = rpaPack();
    const broken = {
      ...pack,
      narrative: {
        ...pack.narrative!,
        missions: pack.narrative!.missions.map((m, i) =>
          i === 0
            ? { ...m, objectives: [{ ...m.objectives[0]!, landmark_id: 'landmark_ghost' }] }
            : m,
        ),
      },
    };
    const errors = validateGamePack(broken);
    expect(errors.some((e) => e.includes('unknown landmark'))).toBe(true);
  });

  it('rejects a narrative with an unknown speaker', () => {
    const pack = rpaPack();
    const broken = {
      ...pack,
      narrative: {
        ...pack.narrative!,
        cutscenes: pack.narrative!.cutscenes.map((c, i) =>
          i === 0 ? { ...c, lines: [{ ...c.lines[0]!, speaker_id: 'ghost' }] } : c,
        ),
      },
    };
    const errors = validateGamePack(broken);
    expect(errors.some((e) => e.includes('unknown speaker'))).toBe(true);
  });

  it('works for a second repository', () => {
    const pack = compileGamePack(buildWorld(ECOMMERCE_ARCHITECTURE).placed);
    expect(pack.narrative).toBeTruthy();
    expect(validateGamePack(pack)).toEqual([]);
  });
});
