import type { DiagramRegion } from '../schemas/architecture';
import type {
  WorldSpecification,
  PlacedWorld,
  PlacedEntity,
  PlacedZone,
  PlacedConnection,
  Vec3,
} from '../schemas/world';
import { primitiveFootprint } from '../registries/primitiveRegistry';
import { mulberry32, randRange, round4 } from './random';
import { planRoute, pathLength, validateRouteEndpoints } from './routePlanner';

/**
 * Deterministic Layout Engine — World Specification -> Placed World Specification.
 *
 * Hybrid approach:
 *   1. create coarse zone regions
 *   2. position zones according to architecture-diagram regions
 *   3. position root nodes
 *   4. place children around parents
 *   5. preserve topology
 *   6. avoid overlap
 *   7. resolve collisions
 *   8. route connections
 *   9. validate route endpoints
 *  10. all positions derived from a stable seed
 *
 * Same input + same seed => byte-identical output.
 */

/** Region -> ground-plane center. North is -y, east is +x. */
const REGION_CENTERS: Record<DiagramRegion, { x: number; y: number }> = {
  center: { x: 0, y: 0 },
  north: { x: 0, y: -45 },
  south: { x: 0, y: 45 },
  east: { x: 45, y: 0 },
  west: { x: -45, y: 0 },
  north_east: { x: 34, y: -34 },
  north_west: { x: -34, y: -34 },
  south_east: { x: 34, y: 34 },
  south_west: { x: -34, y: 34 },
  far_east: { x: 95, y: 0 },
  far_west: { x: -95, y: 0 },
  far_north: { x: 0, y: -95 },
  far_south: { x: 0, y: 95 },
};

const ZONE_PADDING = 8;
const MIN_ZONE_SIZE = 24;
const COLLISION_ITERATIONS = 24;
const COLLISION_PADDING = 2.5;

interface MutableEntity {
  id: string;
  zone: string | null;
  anchor: string | null;
  primitive: string;
  position: Vec3;
  footprint: { x: number; y: number };
  height: number;
}

function zoneSizeFor(count: number): { x: number; y: number } {
  const side = Math.max(MIN_ZONE_SIZE, Math.ceil(Math.sqrt(Math.max(count, 1))) * 12 + ZONE_PADDING);
  return { x: side, y: side };
}

/**
 * Step 1 + 2: build zone regions and place them by diagram region.
 * Zones sharing a region are fanned out deterministically so they do not
 * occupy the exact same space.
 */
function layoutZones(world: WorldSpecification): PlacedZone[] {
  const counts = new Map<string, number>();
  for (const entity of world.entities) {
    const key = entity.zone ?? 'ungrouped';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const regionUsage = new Map<DiagramRegion, number>();

  return world.zones.map((zone) => {
    const region = zone.spatial_hint.region;
    const used = regionUsage.get(region) ?? 0;
    regionUsage.set(region, used + 1);

    const base = REGION_CENTERS[region];
    const size = zoneSizeFor(counts.get(zone.id) ?? 0);

    // Fan out duplicates along a deterministic diagonal.
    const offset = used * (size.x + 6);

    return {
      ...zone,
      bounds: {
        center: {
          x: round4(base.x + offset),
          y: round4(base.y + offset),
          z: 0,
        },
        size,
      },
    };
  });
}

/**
 * Step 3 + 4: position roots inside their zone, then place children around
 * their parent. Ordering is by id so the result never depends on input order.
 */
function seedPositions(
  world: WorldSpecification,
  zones: PlacedZone[],
  rng: () => number,
): MutableEntity[] {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const entities: MutableEntity[] = world.entities.map((entity) => {
    const primitive = primitiveFootprint(entity.visual.primitive);
    return {
      id: entity.id,
      zone: entity.zone,
      anchor: entity.spatial.anchor,
      primitive: entity.visual.primitive,
      position: { x: 0, y: 0, z: 0 },
      footprint: primitive,
      height: 0,
    };
  });

  const byId = new Map(entities.map((e) => [e.id, e]));
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));

  // --- Roots: grid within the zone bounds ---
  const rootsByZone = new Map<string, MutableEntity[]>();
  for (const entity of sorted) {
    if (entity.anchor != null && byId.has(entity.anchor)) continue;
    const key = entity.zone ?? 'ungrouped';
    const list = rootsByZone.get(key) ?? [];
    list.push(entity);
    rootsByZone.set(key, list);
  }

  for (const [zoneId, roots] of [...rootsByZone.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const zone = zoneById.get(zoneId);
    const center = zone?.bounds.center ?? { x: 0, y: 0, z: 0 };
    const size = zone?.bounds.size ?? { x: MIN_ZONE_SIZE, y: MIN_ZONE_SIZE };

    const columns = Math.max(1, Math.ceil(Math.sqrt(roots.length)));
    const rows = Math.max(1, Math.ceil(roots.length / columns));
    const stepX = size.x / (columns + 1);
    const stepY = size.y / (rows + 1);

    roots.forEach((entity, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const jitter = randRange(rng, -1.5, 1.5);
      entity.position = {
        x: round4(center.x - size.x / 2 + stepX * (col + 1) + jitter),
        y: round4(center.y - size.y / 2 + stepY * (row + 1) + jitter),
        z: 0,
      };
    });
  }

  // --- Children: orbit their parent deterministically ---
  const childrenByParent = new Map<string, MutableEntity[]>();
  for (const entity of sorted) {
    if (entity.anchor == null || !byId.has(entity.anchor)) continue;
    const list = childrenByParent.get(entity.anchor) ?? [];
    list.push(entity);
    childrenByParent.set(entity.anchor, list);
  }

  for (const [parentId, children] of [...childrenByParent.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const parent = byId.get(parentId)!;
    const radius = Math.max(6, parent.footprint.x * 0.9 + 4);

    children.forEach((child, index) => {
      const angle = (index / children.length) * Math.PI * 2 + randRange(rng, -0.15, 0.15);
      child.position = {
        x: round4(parent.position.x + Math.cos(angle) * radius),
        y: round4(parent.position.y + Math.sin(angle) * radius),
        z: 0,
      };
    });
  }

  return entities;
}

/**
 * Step 5 + 6 + 7: preserve topology while resolving overlap.
 *
 * Anchored children are pulled back toward their parent each iteration so the
 * hierarchy stays readable; all entities are pushed apart when they overlap.
 */
function resolveCollisions(entities: MutableEntity[], rng: () => number): number {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const ordered = [...entities].sort((a, b) => a.id.localeCompare(b.id));

  for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
    let moved = false;

    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i]!;
        const b = ordered[j]!;

        const minX = (a.footprint.x + b.footprint.x) / 2 + COLLISION_PADDING;
        const minY = (a.footprint.y + b.footprint.y) / 2 + COLLISION_PADDING;

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;

        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;

        // Separate along the axis of least resistance.
        if (overlapX < overlapY) {
          const push = (overlapX / 2 + 0.01) * (dx >= 0 ? 1 : -1);
          a.position.x = round4(a.position.x - push);
          b.position.x = round4(b.position.x + push);
        } else {
          const push = (overlapY / 2 + 0.01) * (dy >= 0 ? 1 : -1);
          a.position.y = round4(a.position.y - push);
          b.position.y = round4(b.position.y + push);
        }
      }
    }

    // Topology preservation: re-tether children to their parents.
    for (const entity of ordered) {
      if (entity.anchor == null) continue;
      const parent = byId.get(entity.anchor);
      if (!parent) continue;

      const dx = entity.position.x - parent.position.x;
      const dy = entity.position.y - parent.position.y;
      const distance = Math.hypot(dx, dy);
      const maxDistance = Math.max(10, parent.footprint.x * 1.6 + 6);

      if (distance > maxDistance) {
        const scale = maxDistance / distance;
        entity.position.x = round4(parent.position.x + dx * scale);
        entity.position.y = round4(parent.position.y + dy * scale);
      }
    }

    if (!moved) break;
  }

  // Tiny deterministic jitter breaks perfectly symmetric ties without
  // affecting reproducibility.
  for (const entity of ordered) {
    entity.position.x = round4(entity.position.x + randRange(rng, -0.05, 0.05));
    entity.position.y = round4(entity.position.y + randRange(rng, -0.05, 0.05));
  }

  return COLLISION_ITERATIONS;
}

export function layoutWorld(world: WorldSpecification): PlacedWorld {
  const rng = mulberry32(world.world.seed);

  const zones = layoutZones(world);
  const mutable = seedPositions(world, zones, rng);
  const iterations = resolveCollisions(mutable, rng);

  const positionById = new Map(mutable.map((e) => [e.id, e.position]));

  const entities: PlacedEntity[] = world.entities.map((entity) => {
    const position = positionById.get(entity.id) ?? { x: 0, y: 0, z: 0 };
    return {
      ...entity,
      resolved_position: position,
      resolved_rotation: { x: 0, y: 0, z: 0 },
      resolved_scale: 1,
    };
  });

  // Step 8 + 9: route connections and validate endpoints.
  const connections: PlacedConnection[] = world.connections.map((connection, index) => {
    const from = positionById.get(connection.from) ?? { x: 0, y: 0, z: 0 };
    const to = positionById.get(connection.to) ?? { x: 0, y: 0, z: 0 };

    const path = planRoute(from, to, connection.visual.archetype, world.world.seed + index);

    const errors = validateRouteEndpoints(path, from, to);
    if (errors.length > 0) {
      throw new Error(
        `Route validation failed for connection "${connection.id}": ${errors.join('; ')}`,
      );
    }

    return {
      ...connection,
      path,
      length: pathLength(path),
    };
  });

  return {
    schema_version: '1.0',
    world: world.world,
    zones,
    entities,
    connections,
    behaviors: world.behaviors,
    asset_registry: world.asset_registry,
    layout: {
      algorithm: 'deterministic-hybrid-v1',
      seed: world.world.seed,
      iterations,
    },
  };
}