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
] as const;
export const TerrainTypeSchema = z.enum(TERRAIN_TYPES);
export type TerrainType = z.infer<typeof TerrainTypeSchema>;

/** Terrain that a player can never stand on, regardless of colliders. */
export const IMPASSABLE_TERRAIN: ReadonlySet<TerrainType> = new Set(['void', 'water', 'cliff']);

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
