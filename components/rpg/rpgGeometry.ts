import type { TileCoord } from '@/game/schemas/common';
import type { TileMap } from '@/game/schemas/tilemap';
import type { Theme } from '@/game/schemas/theme';

/**
 * RPG geometry helpers.
 *
 * The game world is a discrete tile grid. Rendering maps tiles to world space
 * with a single, shared convention so terrain, landmarks, sprites and the
 * player can never disagree about where a tile is.
 *
 * Convention: tile (x, y) -> world (x * tileSize, 0, y * tileSize).
 * R3F uses Y-up; the game grid uses Y as depth.
 */

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function tileToWorld(tile: TileCoord, tileSize: number, y = 0): WorldPoint {
  return { x: tile.x * tileSize, y, z: tile.y * tileSize };
}

/** Centre of a tile in world space. */
export function tileCenter(tile: TileCoord, tileSize: number, y = 0): WorldPoint {
  return { x: (tile.x + 0.5) * tileSize, y, z: (tile.y + 0.5) * tileSize };
}

export function mapWorldSize(map: TileMap): { width: number; depth: number } {
  return { width: map.width * map.tile_size, depth: map.height * map.tile_size };
}

export function mapCenter(map: TileMap): WorldPoint {
  return { x: (map.width * map.tile_size) / 2, y: 0, z: (map.height * map.tile_size) / 2 };
}

/** Terrain colour resolved from the theme palette. */
export function terrainColor(terrain: string, theme: Theme): string {
  switch (terrain) {
    case 'path':
      return theme.palette.path;
    case 'water':
      return theme.palette.water;
    case 'cliff':
      return theme.palette.cliff;
    case 'stone':
      return theme.palette.cliff;
    case 'sand':
      return theme.palette.path;
    case 'floor':
      return theme.palette.path;
    case 'void':
      return theme.palette.sky;
    case 'grass':
    default:
      return theme.palette.ground;
  }
}

/** Height offset per terrain, used to give the map a little relief. */
export function terrainHeight(terrain: string): number {
  switch (terrain) {
    case 'water':
      return -0.25;
    case 'cliff':
      return 0.6;
    case 'path':
      return 0.02;
    default:
      return 0;
  }
}
