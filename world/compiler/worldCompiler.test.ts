import { describe, expect, it } from 'vitest';
import { compileWorld, deriveSeed } from '@/world/compiler/worldCompiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';

describe('World Compiler', () => {
  it('is deterministic for the same input', () => {
    const a = compileWorld(RPA_ARCHITECTURE);
    const b = compileWorld(RPA_ARCHITECTURE);
    expect(a).toEqual(b);
  });

  it('derives a stable seed from repository identity', () => {
    expect(deriveSeed('rpa-agent:procedure')).toBe(deriveSeed('rpa-agent:procedure'));
    expect(deriveSeed('rpa-agent:procedure')).not.toBe(deriveSeed('shopfront:main'));
  });

  it('maps groups to zones preserving diagram regions', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const memory = world.zones.find((z) => z.id === 'memory');
    expect(memory?.spatial_hint.region).toBe('north');
  });

  it('maps semantic node types to generic archetypes, not technologies', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const redis = world.entities.find((e) => e.id === 'redis');

    expect(redis?.semantic_type).toBe('database');
    expect(redis?.archetype).toBe('building');
    expect(redis?.visual.primitive).toBe('data_center');
    // The technology name must never leak into the visual contract.
    expect(redis?.visual.primitive).not.toContain('redis');
  });

  it('maps edge types to connection archetypes and vehicles', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const apiCall = world.connections.find((c) => c.id === 'edge_6');

    expect(apiCall?.visual.archetype).toBe('air_route');
    expect(apiCall?.behavior.vehicle).toBe('airplane');
  });

  it('preserves provenance from architecture node to world entity', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const agent = world.entities.find((e) => e.id === 'rpa_agent');

    expect(agent?.provenance?.architecture_node_id).toBe('rpa_agent');
    expect(agent?.provenance?.source?.file).toBe('src/agent/graph.ts');
  });

  it('assigns ungrouped nodes to a synthetic zone', () => {
    const world = compileWorld({
      ...RPA_ARCHITECTURE,
      nodes: [{ id: 'lonely', label: 'Lonely', type: 'service', group: null, parent: null, metadata: {} }],
      edges: [],
    });

    expect(world.entities[0]?.zone).toBe('ungrouped');
    expect(world.zones.some((z) => z.id === 'ungrouped')).toBe(true);
  });

  it('produces different worlds for different repositories', () => {
    const rpa = compileWorld(RPA_ARCHITECTURE);
    const shop = compileWorld(ECOMMERCE_ARCHITECTURE);

    expect(rpa.world.seed).not.toBe(shop.world.seed);
    expect(rpa.entities.map((e) => e.id)).not.toEqual(shop.entities.map((e) => e.id));
    expect(rpa.zones.map((z) => z.id)).not.toEqual(shop.zones.map((z) => z.id));
  });

  it('never emits coordinates', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const serialized = JSON.stringify(world);
    expect(serialized).not.toContain('resolved_position');
    expect(serialized).not.toContain('"x":');
  });
});