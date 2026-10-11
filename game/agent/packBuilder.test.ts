import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { PackBuilder, TOOL_DEFS } from '@/game/agent/packBuilder';
import { playtest } from '@/game/agent/playtest';
import { createDefaultResolver } from '@/game/registries/assetResolver';

function pack() {
  return compileGamePack(buildWorld(RPA_ARCHITECTURE).placed);
}

describe('PackBuilder', () => {
  it('exposes a tool surface for an agent', () => {
    const names = TOOL_DEFS.map((t) => t.name);
    expect(names).toContain('describe_pack');
    expect(names).toContain('place_landmark');
    expect(names).toContain('place_npc');
    expect(names).toContain('validate_pack');
  });

  it('describes the pack', async () => {
    const builder = new PackBuilder(pack());
    const result = await builder.call('describe_pack');
    expect(result.ok).toBe(true);
    expect(result.landmarks).toBeTruthy();
  });

  it('finds a free spot', async () => {
    const builder = new PackBuilder(pack());
    const result = await builder.call('find_free_spot', { near: [10, 10] });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.pos)).toBe(true);
  });

  it('rejects a landmark that overlaps an existing one', async () => {
    const p = pack();
    const builder = new PackBuilder(p);
    const existing = p.landmarks[0]!;
    const result = await builder.call('place_landmark', {
      landmark: {
        id: 'landmark_dupe',
        label: 'Dupe',
        architecture_entity_id: 'x',
        semantic_type: 'service',
        archetype: 'town_hall',
        anchor: existing.anchor,
        footprint: existing.footprint,
        entrance: existing.entrance,
        interaction_id: 'inspect_x',
        region_id: null,
        provenance: { architecture_node_id: 'x', architecture_edge_id: null, source: null },
      },
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('occupied');
  });

  it('rejects an NPC on a landmark entrance', async () => {
    const p = pack();
    const builder = new PackBuilder(p);
    const entrance = p.landmarks[0]!.entrance;
    const result = await builder.call('place_npc', {
      npc: {
        id: 'npc_test',
        label: 'Test',
        role: 'wanderer',
        position: entrance,
        facing: 'south',
        sprite: 'wanderer',
        dialogue_id: 'dialogue_npc_test',
        architecture_entity_id: null,
        quest_hooks: [],
        provenance: { architecture_node_id: null, architecture_edge_id: null, source: null },
      },
    });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain('entrance');
  });

  it('returns errors as data, never throws', async () => {
    const builder = new PackBuilder(pack());
    const result = await builder.call('nonexistent_tool');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('validates the pack through the tool surface', async () => {
    const builder = new PackBuilder(pack());
    const result = await builder.call('validate_pack');
    expect(result.ok).toBe(true);
  });

  it('searches assets through the resolver', async () => {
    const builder = new PackBuilder(pack(), createDefaultResolver());
    const result = await builder.call('search_assets', { query: 'archive' });
    expect(result.ok).toBe(true);
    expect(result.by).toBeTruthy();
  });

  it('reports a missing asset as not ok', async () => {
    const builder = new PackBuilder(pack(), createDefaultResolver());
    const result = await builder.call('search_assets', { query: 'a very distinctive landmark' });
    expect(result.ok).toBe(false);
    expect(result.by).toBe('placeholder');
  });
});

describe('Playtest bot', () => {
  it('completes every quest in the RPA pack', () => {
    const result = playtest(pack());
    expect(result.stuck).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(Object.values(result.quests).every((s) => s === 'completed')).toBe(true);
  });

  it('is deterministic', () => {
    const a = playtest(pack());
    const b = playtest(pack());
    expect(a.steps).toBe(b.steps);
    expect(a.quests).toEqual(b.quests);
  });

  it('reports a stuck reason when a target is unreachable', () => {
    const p = pack();
    // Wall off the map except the spawn tile.
    const broken = {
      ...p,
      map: {
        ...p.map,
        terrain: p.map.terrain.map((t, i) => {
          const x = i % p.map.width;
          const y = Math.floor(i / p.map.width);
          const isSpawn = x === p.spawn.position.x && y === p.spawn.position.y;
          return isSpawn ? t : ('water' as const);
        }),
      },
    };
    const result = playtest(broken);
    expect(result.ok).toBe(false);
    expect(result.stuck).toBeTruthy();
  });
});
