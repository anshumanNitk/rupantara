import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';
import { compileGamePack, fingerprintWorld } from '@/game/compiler/gameCompiler';
import { validateGamePack, floodFill } from '@/game/compiler/validators';
import { isWalkable } from '@/game/schemas/tilemap';

function rpaPack() {
  const { placed } = buildWorld(RPA_ARCHITECTURE);
  return compileGamePack(placed);
}

describe('Game Compiler', () => {
  it('is deterministic for the same input and seed', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    const a = compileGamePack(placed);
    const b = compileGamePack(placed);
    expect(a).toEqual(b);
  });

  it('produces a stable world fingerprint', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    expect(fingerprintWorld(placed)).toBe(fingerprintWorld(placed));
    const shop = buildWorld(ECOMMERCE_ARCHITECTURE).placed;
    expect(fingerprintWorld(placed)).not.toBe(fingerprintWorld(shop));
  });

  it('maps generic semantic types to RPG landmark archetypes, never technologies', () => {
    const pack = rpaPack();
    const archive = pack.landmarks.find((l) => l.architecture_entity_id === 'redis');
    expect(archive?.semantic_type).toBe('database');
    expect(archive?.archetype).toBe('archive');
    // The technology name may appear as a factual label, but never in the
    // visual/archetype contract.
    expect(archive?.archetype).not.toContain('redis');
    expect(archive?.semantic_type).not.toContain('redis');
  });

  it('creates a guide NPC and a dependency-aware quest chain', () => {
    const pack = rpaPack();
    expect(pack.npcs.some((n) => n.role === 'guide')).toBe(true);
    expect(pack.quests.map((q) => q.id)).toContain('q_arrival');
    expect(pack.quests.map((q) => q.id)).toContain('q_survey');
  });

  it('places every landmark entrance on a walkable tile', () => {
    const pack = rpaPack();
    for (const landmark of pack.landmarks) {
      expect(isWalkable(pack.map, landmark.entrance.x, landmark.entrance.y)).toBe(true);
    }
  });

  it('spawns on a walkable tile', () => {
    const pack = rpaPack();
    expect(isWalkable(pack.map, pack.spawn.position.x, pack.spawn.position.y)).toBe(true);
  });

  it('spawns near the guide but not on the same tile', () => {
    const pack = rpaPack();
    const guide = pack.npcs.find((n) => n.role === 'guide');
    expect(guide).toBeDefined();
    const sameTile =
      guide!.position.x === pack.spawn.position.x && guide!.position.y === pack.spawn.position.y;
    expect(sameTile).toBe(false);
    const distance =
      Math.abs(guide!.position.x - pack.spawn.position.x) +
      Math.abs(guide!.position.y - pack.spawn.position.y);
    expect(distance).toBeLessThanOrEqual(2);
  });

  it('reaches every landmark entrance and NPC from spawn', () => {
    const pack = rpaPack();
    const reachable = floodFill(pack.map, pack.spawn.position.x, pack.spawn.position.y);
    for (const landmark of pack.landmarks) {
      expect(reachable.has(`${landmark.entrance.x},${landmark.entrance.y}`)).toBe(true);
    }
    for (const npc of pack.npcs) {
      expect(reachable.has(`${npc.position.x},${npc.position.y}`)).toBe(true);
    }
  });

  it('passes its own structural validators', () => {
    const pack = rpaPack();
    expect(validateGamePack(pack)).toEqual([]);
  });

  it('rejects a pack with an unreachable landmark', () => {
    const pack = rpaPack();
    // Wall off the map by turning every non-spawn tile into water.
    const broken = {
      ...pack,
      map: {
        ...pack.map,
        terrain: pack.map.terrain.map((t, i) => {
          const x = i % pack.map.width;
          const y = Math.floor(i / pack.map.width);
          const isSpawn = x === pack.spawn.position.x && y === pack.spawn.position.y;
          return isSpawn ? t : ('water' as const);
        }),
      },
    };
    const errors = validateGamePack(broken);
    expect(errors.some((e) => e.includes('not reachable'))).toBe(true);
  });

  it('rejects a quest cycle', () => {
    const pack = rpaPack();
    const broken = {
      ...pack,
      quests: pack.quests.map((q) =>
        q.id === 'q_arrival' ? { ...q, prerequisites: ['q_survey'] } : q,
      ),
    };
    const errors = validateGamePack(broken);
    expect(errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('rejects overlapping landmark footprints', () => {
    const pack = rpaPack();
    const first = pack.landmarks[0]!;
    const second = pack.landmarks[1]!;
    const broken = {
      ...pack,
      landmarks: pack.landmarks.map((l) =>
        l.id === second.id ? { ...l, anchor: { ...first.anchor } } : l,
      ),
    };
    const errors = validateGamePack(broken);
    expect(errors.some((e) => e.includes('overlaps'))).toBe(true);
  });

  it('works for a second, different repository', () => {
    const { placed } = buildWorld(ECOMMERCE_ARCHITECTURE);
    const pack = compileGamePack(placed);
    expect(validateGamePack(pack)).toEqual([]);
    expect(pack.landmarks.length).toBeGreaterThan(0);
  });
});
