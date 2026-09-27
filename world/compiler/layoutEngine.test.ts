import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { layoutWorld } from '@/world/compiler/layoutEngine';
import { compileWorld } from '@/world/compiler/worldCompiler';
import { validatePlacedWorld } from '@/world/compiler/validator';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';

describe('Deterministic Layout Engine', () => {
  it('produces byte-identical output for the same input and seed', () => {
    const first = buildWorld(RPA_ARCHITECTURE);
    const second = buildWorld(RPA_ARCHITECTURE);
    expect(JSON.stringify(first.placed)).toBe(JSON.stringify(second.placed));
  });

  it('produces different layouts for different seeds', () => {
    const a = buildWorld(RPA_ARCHITECTURE, { seed: 1 });
    const b = buildWorld(RPA_ARCHITECTURE, { seed: 2 });
    expect(JSON.stringify(a.placed.entities)).not.toBe(JSON.stringify(b.placed.entities));
  });

  it('places every entity at a finite coordinate', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    for (const entity of placed.entities) {
      expect(Number.isFinite(entity.resolved_position.x)).toBe(true);
      expect(Number.isFinite(entity.resolved_position.y)).toBe(true);
      expect(Number.isFinite(entity.resolved_position.z)).toBe(true);
    }
  });

  it('resolves collisions between entities', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    const entities = placed.entities;

    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i]!;
        const b = entities[j]!;
        const distance = Math.hypot(
          a.resolved_position.x - b.resolved_position.x,
          a.resolved_position.y - b.resolved_position.y,
        );
        // Entities must not occupy the exact same point.
        expect(distance).toBeGreaterThan(0.5);
      }
    }
  });

  it('routes every connection with valid endpoints', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);

    for (const connection of placed.connections) {
      const from = placed.entities.find((e) => e.id === connection.from)!;
      const to = placed.entities.find((e) => e.id === connection.to)!;

      const start = connection.path[0]!;
      const end = connection.path[connection.path.length - 1]!;

      expect(Math.hypot(start.x - from.resolved_position.x, start.y - from.resolved_position.y)).toBeLessThan(0.001);
      expect(Math.hypot(end.x - to.resolved_position.x, end.y - to.resolved_position.y)).toBeLessThan(0.001);
      expect(connection.length).toBeGreaterThan(0);
    }
  });

  it('keeps children near their parent (topology preservation)', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    const child = placed.entities.find((e) => e.id === 'procedure_store')!;
    const parent = placed.entities.find((e) => e.id === 'redis')!;

    const distance = Math.hypot(
      child.resolved_position.x - parent.resolved_position.x,
      child.resolved_position.y - parent.resolved_position.y,
    );

    expect(distance).toBeLessThan(30);
  });

  it('places zones according to their diagram region', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    const memory = placed.zones.find((z) => z.id === 'memory')!;
    const execution = placed.zones.find((z) => z.id === 'execution')!;

    // memory is north (-y), execution is east (+x)
    expect(memory.bounds.center.y).toBeLessThan(0);
    expect(execution.bounds.center.x).toBeGreaterThan(0);
  });

  it('passes post-layout validation', () => {
    const { placed } = buildWorld(RPA_ARCHITECTURE);
    expect(validatePlacedWorld(placed)).toEqual([]);
  });

  it('lays out a second, unrelated repository without special-casing', () => {
    const { architecture, placed } = buildWorld(ECOMMERCE_ARCHITECTURE);
    expect(validatePlacedWorld(placed)).toEqual([]);
    expect(placed.entities.length).toBe(architecture.nodes.length);
    expect(placed.connections.length).toBe(architecture.edges.length);
  });

  it('is stable when the layout engine is called directly', () => {
    const world = compileWorld(RPA_ARCHITECTURE);
    const a = layoutWorld(world);
    const b = layoutWorld(world);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});