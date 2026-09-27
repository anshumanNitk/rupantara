import { describe, expect, it } from 'vitest';
import { planRoute, pathLength, validateRouteEndpoints } from '@/world/compiler/routePlanner';
import type { Vec3 } from '@/world/schemas/world';

const A: Vec3 = { x: 0, y: 0, z: 0 };
const B: Vec3 = { x: 20, y: 10, z: 0 };

describe('Route Planner', () => {
  it('is deterministic for the same seed', () => {
    const a = planRoute(A, B, 'road', 42);
    const b = planRoute(A, B, 'road', 42);
    expect(a).toEqual(b);
  });

  it('produces an orthogonal bend for ground routes', () => {
    const path = planRoute(A, B, 'road', 7);
    expect(path.length).toBe(3);
    // The bend shares one axis with each endpoint.
    const bend = path[1]!;
    const sharesXWithTarget = Math.abs(bend.x - B.x) < 0.001;
    const sharesYWithSource = Math.abs(bend.y - A.y) < 0.001;
    expect(sharesXWithTarget || sharesYWithSource).toBe(true);
  });

  it('produces an elevated arc for air routes', () => {
    const path = planRoute(A, B, 'air_route', 7);
    expect(path.length).toBeGreaterThan(3);
    const maxZ = Math.max(...path.map((p) => p.z));
    expect(maxZ).toBeGreaterThan(5);
  });

  it('always starts and ends at the requested endpoints', () => {
    for (const archetype of ['road', 'bridge', 'air_route', 'pipe', 'beam', 'data_route'] as const) {
      const path = planRoute(A, B, archetype, 3);
      expect(validateRouteEndpoints(path, A, B)).toEqual([]);
    }
  });

  it('computes a positive path length', () => {
    const path = planRoute(A, B, 'road', 1);
    expect(pathLength(path)).toBeGreaterThan(0);
  });

  it('reports detached endpoints', () => {
    const path = planRoute(A, B, 'road', 1);
    const errors = validateRouteEndpoints(path, { x: 99, y: 99, z: 0 }, B);
    expect(errors.length).toBeGreaterThan(0);
  });
});