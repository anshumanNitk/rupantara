import type { Vec3, ConnectionArchetype } from '../schemas/world';
import { mulberry32, randRange, round4 } from './random';

/**
 * Route Planner — turns two resolved positions into a routed path.
 *
 * Ground routes get an orthogonal bend (like streets). Air routes get an arc
 * with an elevated apex. Routing is deterministic given the same seed.
 */

const GROUND_ARCHETYPES: ReadonlySet<ConnectionArchetype> = new Set([
  'road',
  'bridge',
  'pipe',
  'data_route',
  'beam',
]);

export function planRoute(
  from: Vec3,
  to: Vec3,
  archetype: ConnectionArchetype,
  seed: number,
): Vec3[] {
  const rng = mulberry32(seed);

  if (archetype === 'air_route') {
    return planArc(from, to, rng);
  }

  if (GROUND_ARCHETYPES.has(archetype)) {
    return planOrthogonal(from, to, archetype, rng);
  }

  return [from, to];
}

/**
 * L-shaped street routing. The bend axis is chosen deterministically from the
 * seed so parallel routes do not all stack on the same axis.
 */
function planOrthogonal(
  from: Vec3,
  to: Vec3,
  archetype: ConnectionArchetype,
  rng: () => number,
): Vec3[] {
  const z = archetype === 'bridge' ? Math.max(from.z, to.z) + 0.6 : 0.15;
  const bendOnX = rng() < 0.5;

  const bend: Vec3 = bendOnX
    ? { x: to.x, y: from.y, z }
    : { x: from.x, y: to.y, z };

  const start: Vec3 = { x: from.x, y: from.y, z };
  const end: Vec3 = { x: to.x, y: to.y, z };

  // Skip the bend when it is degenerate (already axis-aligned).
  const degenerate =
    Math.abs(start.x - bend.x) < 0.01 && Math.abs(start.y - bend.y) < 0.01;

  return degenerate ? [start, end] : [start, bend, end];
}

/** Parabolic arc with an elevated apex, used for api_call / air routes. */
function planArc(from: Vec3, to: Vec3, rng: () => number): Vec3[] {
  const segments = 8;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const apex = Math.max(6, distance * 0.35) + randRange(rng, 0, 2);
  const points: Vec3[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    // 4t(1-t) peaks at 1 when t = 0.5.
    const z = from.z + (to.z - from.z) * t + apex * 4 * t * (1 - t);
    points.push({ x: round4(x), y: round4(y), z: round4(z) });
  }

  return points;
}

export function pathLength(path: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return round4(total);
}

/**
 * Validates that a routed path actually starts and ends at the intended
 * endpoints. Guards against routing bugs silently detaching roads.
 */
export function validateRouteEndpoints(
  path: Vec3[],
  from: Vec3,
  to: Vec3,
  tolerance = 0.001,
): string[] {
  const errors: string[] = [];
  if (path.length < 2) {
    errors.push('Route must contain at least two points');
    return errors;
  }

  const start = path[0]!;
  const end = path[path.length - 1]!;

  if (Math.hypot(start.x - from.x, start.y - from.y) > tolerance) {
    errors.push(`Route start (${start.x},${start.y}) does not match source (${from.x},${from.y})`);
  }
  if (Math.hypot(end.x - to.x, end.y - to.y) > tolerance) {
    errors.push(`Route end (${end.x},${end.y}) does not match target (${to.x},${to.y})`);
  }

  return errors;
}