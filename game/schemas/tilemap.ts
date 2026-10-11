import { z } from 'zod';
import { TileCoordSchema } from './common';

/**
 * Tile map — the walkable terrain grid.
 *
 * Terrain is a flat row-major grid of terrain ids. Walkability is derived from
 * terrain plus explicit colliders, so the two can never disagree silently.
 */

export const TERRAIN_TYPES = [
  'void',
  'grass',
  'stone',
  'path',
  'water',
  'cliff',
  'sand',
  'floor',
  'plaza',
] as const;
export const TerrainTypeSchema = z.enum(TERRAIN_TYPES);
export type TerrainType = z.infer<typeof TerrainTypeSchema>;

/** Terrain that a player can never stand on, regardless of colliders. */
export const IMPASSABLE_TERRAIN: ReadonlySet<TerrainType> = new Set(['void', 'water', 'cliff']);

/**
 * A district — a town quarter built from one architecture zone.
 *
 * Districts are what turn a scatter of landmarks into a place: each one has a
 * plaza ring, a coloured floor and its own buildings. They are pure data; the
 * renderer only knows bounds and colour.
 */
export const DISTRICT_BIOMES = [
  'commons',
  'archives',
  'forges',
  'towers',
  'gates',
  'camps',
  'markets',
  'gardens',
] as const;
export const DistrictBiomeSchema = z.enum(DISTRICT_BIOMES);
export type DistrictBiome = z.infer<typeof DistrictBiomeSchema>;

export const DistrictSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Inclusive tile bounds of the district (ring included). */
  min: TileCoordSchema,
  max: TileCoordSchema,
  /** Floor colour for this district. */
  color: z.string(),
  /** Dependency layer, used to order districts west -> east. */
  layer: z.number().int().default(0),
  /** Visual biome derived from the district's landmarks. */
  biome: DistrictBiomeSchema.default('commons'),
  /** A short rumor the player can overhear about this place. */
  rumor: z.string().nullable().default(null),
});
export type District = z.infer<typeof DistrictSchema>;

/** A decorative prop. Never blocks movement; purely visual. */
export const DecorationSchema = z.object({
  kind: z.enum(['tree', 'rock', 'bush']),
  position: TileCoordSchema,
});
export type Decoration = z.infer<typeof DecorationSchema>;

export const ColliderSchema = z.object({
  id: z.string().min(1),
  /** Inclusive tile bounds occupied by the collider. */
  min: TileCoordSchema,
  max: TileCoordSchema,
  /** Optional link to the landmark that owns this collider. */
  landmark_id: z.string().nullable().default(null),
});
export type Collider = z.infer<typeof ColliderSchema>;

export const TileMapSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** World units per tile. */
  tile_size: z.number().positive(),
  /** Row-major terrain grid, length = width * height. */
  terrain: z.array(TerrainTypeSchema),
  colliders: z.array(ColliderSchema).default([]),
  /** Cells that belong to a carved path (used for rendering + spawn safety). */
  path_cells: z.array(TileCoordSchema).default([]),
  /** Town quarters, one per architecture zone. */
  districts: z.array(DistrictSchema).default([]),
  /** Decorative props (trees, rocks). Never block movement. */
  decorations: z.array(DecorationSchema).default([]),
});
export type TileMap = z.infer<typeof TileMapSchema>;

export function tileIndex(map: Pick<TileMap, 'width'>, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: Pick<TileMap, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function terrainAt(map: TileMap, x: number, y: number): TerrainType | null {
  if (!inBounds(map, x, y)) return null;
  return map.terrain[tileIndex(map, x, y)] ?? null;
}

/**
 * Walkability is a pure function of terrain + colliders. It is the single
 * source of truth used by the compiler, the validators and the runtime.
 */
export function isWalkable(map: TileMap, x: number, y: number): boolean {
  const terrain = terrainAt(map, x, y);
  if (terrain === null || IMPASSABLE_TERRAIN.has(terrain)) return false;

  for (const collider of map.colliders) {
    if (
      x >= collider.min.x &&
      x <= collider.max.x &&
      y >= collider.min.y &&
      y <= collider.max.y
    ) {
      return false;
    }
  }
  return true;
}
