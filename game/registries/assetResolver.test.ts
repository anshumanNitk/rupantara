import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { findNearbyInteractable } from '@/components/rpg/interactionSystem';
import { resolveGameAsset, DEFAULT_ASSET_MANIFEST } from '@/game/registries/assetResolver';

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

describe('Layered asset resolver', () => {
  it('resolves a procedural asset without any external dependency', () => {
    const resolution = resolveGameAsset('landmark.guild_hall', 'guild_hall');
    expect(resolution.kind).toBe('procedural');
  });

  it('resolves a local sprite sheet', () => {
    const resolution = resolveGameAsset('sprites.arcane', 'guild_hall');
    expect(resolution.kind).toBe('sprite_sheet');
    if (resolution.kind === 'sprite_sheet') {
      expect(resolution.source).toBe('local');
    }
  });

  it('resolves an external asset when allowed', () => {
    const resolution = resolveGameAsset('landmark.tower.external', 'tower');
    expect(resolution.kind).toBe('glb');
    if (resolution.kind === 'glb') {
      expect(resolution.source).toBe('external');
    }
  });

  it('falls back to procedural when external assets are disabled', () => {
    const resolution = resolveGameAsset('landmark.tower.external', 'tower', { allowExternal: false });
    expect(resolution.kind).toBe('procedural');
  });

  it('falls back to procedural for unknown ids and never throws', () => {
    const resolution = resolveGameAsset('does.not.exist', 'fallback_primitive');
    expect(resolution).toEqual({ kind: 'procedural', primitive: 'fallback_primitive' });
  });

  it('falls back to procedural for a null asset id', () => {
    const resolution = resolveGameAsset(null, 'fallback_primitive');
    expect(resolution).toEqual({ kind: 'procedural', primitive: 'fallback_primitive' });
  });

  it('exposes a manifest with local and external entries', () => {
    const sources = new Set(DEFAULT_ASSET_MANIFEST.entries.map((e) => e.source));
    expect(sources.has('procedural')).toBe(true);
    expect(sources.has('local')).toBe(true);
    expect(sources.has('external')).toBe(true);
  });
});
