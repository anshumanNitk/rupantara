import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { findNearbyInteractable } from '@/components/rpg/interactionSystem';
import {
  resolveGameAsset,
  DEFAULT_ASSET_MANIFEST,
  createDefaultResolver,
  GeneratorProvider,
  CatalogProvider,
  ProceduralProvider,
  PlaceholderProvider,
  scoreEntry,
} from '@/game/registries/assetResolver';

function pack() {
  return compileGamePack(buildWorld(RPA_ARCHITECTURE).placed);
}

describe('Interaction system', () => {
  it('finds the guide when standing next to it', () => {
    const p = pack();
    const guide = p.npcs.find((n) => n.role === 'guide')!;
    const nearby = findNearbyInteractable(p, guide.position, 2);
    expect(nearby?.kind).toBe('npc');
    expect(nearby?.id).toBe(guide.id);
  });

  it('finds a landmark entrance when standing on it', () => {
    const p = pack();
    const landmark = p.landmarks[0]!;
    const nearby = findNearbyInteractable(p, landmark.entrance, 1);
    expect(nearby).not.toBeNull();
    expect(nearby?.interactionId).toBe(landmark.interaction_id);
  });

  it('returns null when nothing is in range', () => {
    const p = pack();
    // A far corner of the map with no landmark or NPC.
    const nearby = findNearbyInteractable(p, { x: 0, y: 0 }, 0);
    expect(nearby).toBeNull();
  });

  it('is deterministic for ties', () => {
    const p = pack();
    const guide = p.npcs.find((n) => n.role === 'guide')!;
    const a = findNearbyInteractable(p, guide.position, 3);
    const b = findNearbyInteractable(p, guide.position, 3);
    expect(a).toEqual(b);
  });
});

describe('Layered asset resolver (backwards-compatible)', () => {
  it('resolves a procedural asset without any external dependency', async () => {
    const resolution = await resolveGameAsset('landmark.guild_hall', 'guild_hall');
    expect(resolution.kind).toBe('procedural');
  });

  it('never ships dead public-folder or CDN URIs in the default manifest', () => {
    for (const entry of DEFAULT_ASSET_MANIFEST.entries) {
      expect(entry.uri).toBeNull();
      expect(entry.source).toBe('procedural');
    }
  });

  it('falls back to procedural when a missing curated id is requested', async () => {
    const resolution = await resolveGameAsset('sprites.arcane', 'guild_hall');
    expect(resolution.kind).toBe('procedural');
  });

  it('falls back to procedural when an unknown external id is requested', async () => {
    const resolution = await resolveGameAsset('landmark.tower.external', 'tower');
    expect(resolution.kind).toBe('procedural');
  });

  it('falls back to procedural when external assets are disabled', async () => {
    const resolution = await resolveGameAsset('landmark.tower.external', 'tower', { allowExternal: false });
    expect(resolution.kind).toBe('procedural');
  });

  it('falls back to procedural for unknown ids and never throws', async () => {
    const resolution = await resolveGameAsset('does.not.exist', 'fallback_primitive');
    expect(resolution.kind).toBe('procedural');
  });

  it('falls back to procedural for a null asset id', async () => {
    const resolution = await resolveGameAsset(null, 'fallback_primitive');
    expect(resolution.kind).toBe('procedural');
  });

  it('exposes a procedural-only default manifest', () => {
    const sources = new Set(DEFAULT_ASSET_MANIFEST.entries.map((e) => e.source));
    expect(sources.has('procedural')).toBe(true);
    expect(sources.has('local')).toBe(false);
    expect(sources.has('external')).toBe(false);
  });
});

describe('Provider-chain resolver', () => {
  it('scores an exact match as 1 and a miss as 0', () => {
    expect(scoreEntry({ ref: 'guild hall' }, { id: 'guild_hall', type: 'glb', url: 'x' })).toBe(1);
    expect(scoreEntry({ ref: 'guild hall' }, { id: 'banana', type: 'glb', url: 'x' })).toBe(0);
  });

  it('tags every resolution with provenance', async () => {
    const resolver = createDefaultResolver();
    const result = await resolver.resolve({ primitive: 'guild_hall' });
    expect(result.by).toBe('procedural');
    expect(resolver.assetReport().length).toBe(1);
  });

  it('caches identical requests', async () => {
    let calls = 0;
    const generator = new GeneratorProvider('gen', async () => {
      calls += 1;
      return { kind: 'generated', uri: '/gen/a.png', assetId: 'a', prompt: 'a' };
    });
    const resolver = createDefaultResolver({ generator });
    await resolver.resolve({ ref: 'unique thing' });
    await resolver.resolve({ ref: 'unique thing' });
    expect(calls).toBe(1);
  });

  it('falls through to the generator when nothing else matches', async () => {
    const generator = new GeneratorProvider('gen', async (req) => ({
      kind: 'generated',
      uri: `/gen/${req.ref}.png`,
      assetId: String(req.ref),
      prompt: String(req.ref),
    }));
    const resolver = createDefaultResolver({ generator });
    const result = await resolver.resolve({ ref: 'a very distinctive landmark' });
    expect(result.kind).toBe('generated');
    expect(result.by).toBe('gen');
  });

  it('never throws and always returns a result', async () => {
    const failing = new GeneratorProvider('boom', async () => {
      throw new Error('provider exploded');
    });
    const resolver = createDefaultResolver({ generator: failing });
    const result = await resolver.resolve({ ref: 'a very distinctive landmark' });
    expect(result).toBeTruthy();
    // The failing generator is skipped; the placeholder is the guaranteed end.
    expect(result.kind).toBe('placeholder');
  });

  it('prefers a curated catalog entry over fuzzy procedural', async () => {
    const resolver = createDefaultResolver({
      manifest: [{ id: 'guild_hall', type: 'glb', url: '/curated.glb' }],
    });
    const result = await resolver.resolve({ ref: 'guild hall' });
    expect(result.kind).toBe('glb');
    expect(result.by).toBe('manifest');
  });

  it('exposes the individual providers for composition', () => {
    expect(new ProceduralProvider().name).toBe('procedural');
    expect(new ProceduralProvider(true).name).toBe('procedural-fuzzy');
    expect(new PlaceholderProvider().name).toBe('placeholder');
    expect(new CatalogProvider('x', []).name).toBe('x');
  });

  it('placeholder is the guaranteed final link', async () => {
    const resolver = createDefaultResolver();
    const result = await resolver.resolve({});
    expect(result.kind).toBe('placeholder');
  });
});
