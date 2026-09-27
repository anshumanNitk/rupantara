import { z } from 'zod';
import { DiagramRegionSchema } from './architecture';

/**
 * World Specification — the canonical intermediate representation.
 *
 * This is the interface between Architecture Intelligence and the visualization
 * system. It is pure data: no React, no Three.js, no repository-specific logic.
 *
 * It describes WHAT exists and HOW it should be represented, but never exact
 * coordinates. Coordinates are produced later by the deterministic layout engine.
 */

export const ENTITY_ARCHETYPES = ['building', 'person', 'vehicle', 'environment', 'effect'] as const;
export const EntityArchetypeSchema = z.enum(ENTITY_ARCHETYPES);
export type EntityArchetype = z.infer<typeof EntityArchetypeSchema>;

export const CONNECTION_ARCHETYPES = [
  'road',
  'bridge',
  'air_route',
  'pipe',
  'beam',
  'data_route',
] as const;
export const ConnectionArchetypeSchema = z.enum(CONNECTION_ARCHETYPES);
export type ConnectionArchetype = z.infer<typeof ConnectionArchetypeSchema>;

export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof Vec3Schema>;

export const WorldZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  spatial_hint: z.object({ region: DiagramRegionSchema }),
});
export type WorldZone = z.infer<typeof WorldZoneSchema>;

export const WorldEntitySchema = z.object({
  id: z.string().min(1),
  semantic_type: z.string().min(1),
  archetype: EntityArchetypeSchema,
  zone: z.string().nullable(),

  spatial: z.object({
    anchor: z.string().nullable(),
    relation: z.string().nullable(),
    placement: z.string().nullable(),
  }),

  visual: z.object({
    primitive: z.string().min(1),
    asset: z.string().nullable().default(null),
  }),

  metadata: z.record(z.unknown()).default({}),

  /** Provenance: world entity -> architecture node -> repository source. */
  provenance: z
    .object({
      architecture_node_id: z.string(),
      source: z
        .object({
          file: z.string().optional(),
          symbol: z.string().optional(),
          line: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type WorldEntity = z.infer<typeof WorldEntitySchema>;

export const WorldConnectionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  semantic_type: z.string().min(1),
  visual: z.object({ archetype: ConnectionArchetypeSchema }),
  behavior: z
    .object({
      vehicle: z.string().nullable().default(null),
      animation: z.string().nullable().default(null),
    })
    .default({ vehicle: null, animation: null }),
  provenance: z
    .object({ architecture_edge_id: z.string() })
    .optional(),
});
export type WorldConnection = z.infer<typeof WorldConnectionSchema>;

export const AssetDescriptorSchema = z.object({
  asset_id: z.string().min(1),
  kind: z.enum(['glb', 'procedural']),
  uri: z.string().nullable().default(null),
  license: z.string().optional(),
  source: z.string().optional(),
});
export type AssetDescriptor = z.infer<typeof AssetDescriptorSchema>;

export const WorldSpecificationSchema = z.object({
  schema_version: z.literal('1.0'),
  world: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    seed: z.number().int(),
    coordinate_system: z.literal('x-right,y-depth,z-up'),
  }),
  zones: z.array(WorldZoneSchema).default([]),
  entities: z.array(WorldEntitySchema).min(1),
  connections: z.array(WorldConnectionSchema).default([]),
  behaviors: z.array(z.record(z.unknown())).default([]),
  asset_registry: z.array(AssetDescriptorSchema).default([]),
});
export type WorldSpecification = z.infer<typeof WorldSpecificationSchema>;

/**
 * Placed World Specification — a World Specification with resolved coordinates
 * and routed paths. Produced by the deterministic layout engine.
 */
export const PlacedEntitySchema = WorldEntitySchema.extend({
  resolved_position: Vec3Schema,
  resolved_rotation: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
  resolved_scale: z.number().positive().default(1),
});
export type PlacedEntity = z.infer<typeof PlacedEntitySchema>;

export const PlacedZoneSchema = WorldZoneSchema.extend({
  bounds: z.object({
    center: Vec3Schema,
    size: z.object({ x: z.number(), y: z.number() }),
  }),
});
export type PlacedZone = z.infer<typeof PlacedZoneSchema>;

export const PlacedConnectionSchema = WorldConnectionSchema.extend({
  path: z.array(Vec3Schema).min(2),
  length: z.number().nonnegative(),
});
export type PlacedConnection = z.infer<typeof PlacedConnectionSchema>;

export const PlacedWorldSchema = z.object({
  schema_version: z.literal('1.0'),
  world: WorldSpecificationSchema.shape.world,
  zones: z.array(PlacedZoneSchema),
  entities: z.array(PlacedEntitySchema),
  connections: z.array(PlacedConnectionSchema),
  behaviors: z.array(z.record(z.unknown())).default([]),
  asset_registry: z.array(AssetDescriptorSchema).default([]),
  layout: z.object({
    algorithm: z.literal('deterministic-hybrid-v1'),
    seed: z.number().int(),
    iterations: z.number().int().nonnegative(),
  }),
});
export type PlacedWorld = z.infer<typeof PlacedWorldSchema>;

export function validateWorldSpecification(world: WorldSpecification): string[] {
  const errors: string[] = [];
  const zoneIds = new Set(world.zones.map((z) => z.id));
  const entityIds = new Set<string>();

  for (const entity of world.entities) {
    if (entityIds.has(entity.id)) errors.push(`Duplicate entity id: ${entity.id}`);
    entityIds.add(entity.id);
  }

  for (const entity of world.entities) {
    if (entity.zone !== null && !zoneIds.has(entity.zone)) {
      errors.push(`Entity "${entity.id}" references unknown zone "${entity.zone}"`);
    }
    if (entity.spatial.anchor !== null && !entityIds.has(entity.spatial.anchor)) {
      errors.push(`Entity "${entity.id}" references unknown anchor "${entity.spatial.anchor}"`);
    }
  }

  for (const connection of world.connections) {
    if (!entityIds.has(connection.from)) {
      errors.push(`Connection "${connection.id}" has unknown source "${connection.from}"`);
    }
    if (!entityIds.has(connection.to)) {
      errors.push(`Connection "${connection.id}" has unknown target "${connection.to}"`);
    }
  }

  return errors;
}