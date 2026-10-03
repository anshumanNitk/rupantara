import type { PlacedWorld } from '@/world/schemas/world';
import type { TileCoord } from '../schemas/common';
import type { GameRegion } from '../schemas/gamePack';
import type { Collider, TerrainType, TileMap } from '../schemas/tilemap';
import { tileIndex } from '../schemas/tilemap';
import { resolveLandmarkRole } from '../registries/semanticWorldRegistry';
import { resolveEdgeGameplay } from '../registries/semanticWorldRegistry';
import { astar, nearestWalkable } from './grid';

/**
 * Map compiler — PlacedWorld -> tile map + landmark placements + regions.
 *
 * Deterministic: entities are processed in id order, overlap resolution is
 * integer and stable, and path carving uses a deterministic A*.
 */

export const TILE_SIZE = 2;
const MAP_MARGIN = 4;
const MAX_MAP_SIDE = 220;
const OVERLAP_ITERATIONS = 40;

export interface LandmarkPlacement {
  entityId: string;
  anchor: TileCoord;
  footprint: { w: number; h: number };
  entrance: TileCoord;
  regionId: string | null;
}

export interface MapCompileResult {
  map: TileMap;
  regions: GameRegion[];
  placements: LandmarkPlacement[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function overlapArea(a: Rect, b: Rect): { x: number; y: number } {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { x: Math.max(ox, 0), y: Math.max(oy, 0) };
}

/**
 * Places landmarks on the tile grid from their resolved world positions, then
 * deterministically pushes overlapping footprints apart.
 */
function placeLandmarks(placed: PlacedWorld): Map<string, Rect> {
  const sorted = [...placed.entities].sort((a, b) => a.id.localeCompare(b.id));
  const rects = new Map<string, Rect>();

  for (const entity of sorted) {
    const role = resolveLandmarkRole(entity.semantic_type);
    const x = Math.round(entity.resolved_position.x / TILE_SIZE);
    const y = Math.round(entity.resolved_position.y / TILE_SIZE);
    rects.set(entity.id, { x, y, w: role.footprint.w, h: role.footprint.h });
  }

  const ids = [...rects.keys()];

  for (let iteration = 0; iteration < OVERLAP_ITERATIONS; iteration += 1) {
    let moved = false;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = rects.get(ids[i]!)!;
        const b = rects.get(ids[j]!)!;
        if (!rectsOverlap(a, b)) continue;

        moved = true;
        const overlap = overlapArea(a, b);
        const aCenterX = a.x + a.w / 2;
        const bCenterX = b.x + b.w / 2;
        const aCenterY = a.y + a.h / 2;
        const bCenterY = b.y + b.h / 2;

        if (overlap.x <= overlap.y) {
          const dir = bCenterX >= aCenterX ? 1 : -1;
          const push = Math.ceil(overlap.x / 2) + 1;
          a.x -= push * dir;
          b.x += push * dir;
        } else {
          const dir = bCenterY >= aCenterY ? 1 : -1;
          const push = Math.ceil(overlap.y / 2) + 1;
          a.y -= push * dir;
          b.y += push * dir;
        }
      }
    }
    if (!moved) break;
  }

  return rects;
}

/** Shifts all rects so the minimum corner sits at MAP_MARGIN. */
function normalize(rects: Map<string, Rect>): { shiftX: number; shiftY: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const rect of rects.values()) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
  }
  if (!Number.isFinite(minX)) return { shiftX: 0, shiftY: 0 };

  const shiftX = MAP_MARGIN - minX;
  const shiftY = MAP_MARGIN - minY;
  for (const rect of rects.values()) {
    rect.x += shiftX;
    rect.y += shiftY;
  }
  return { shiftX, shiftY };
}

function mapSize(rects: Map<string, Rect>): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects.values()) {
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return {
    width: Math.min(maxX + MAP_MARGIN, MAX_MAP_SIDE),
    height: Math.min(maxY + MAP_MARGIN, MAX_MAP_SIDE),
  };
}

/** Finds a walkable tile adjacent to a footprint, preferring the south edge. */
function findEntrance(map: TileMap, rect: Rect): TileCoord {
  const candidates: TileCoord[] = [];
  // South edge (y = rect.y + h), left to right.
  for (let x = rect.x; x < rect.x + rect.w; x += 1) candidates.push({ x, y: rect.y + rect.h });
  // East edge.
  for (let y = rect.y; y < rect.y + rect.h; y += 1) candidates.push({ x: rect.x + rect.w, y });
  // West edge.
  for (let y = rect.y; y < rect.y + rect.h; y += 1) candidates.push({ x: rect.x - 1, y });
  // North edge.
  for (let x = rect.x; x < rect.x + rect.w; x += 1) candidates.push({ x, y: rect.y - 1 });

  for (const candidate of candidates) {
    const walkable = nearestWalkable(map, candidate.x, candidate.y);
    if (walkable) return walkable;
  }
  return { x: rect.x, y: rect.y + rect.h };
}

export function compileMap(placed: PlacedWorld): MapCompileResult {
  const rects = placeLandmarks(placed);
  const { shiftX, shiftY } = normalize(rects);
  const { width, height } = mapSize(rects);

  // Base terrain: grass everywhere.
  const terrain: TerrainType[] = new Array(width * height).fill('grass');

  // Colliders: every landmark footprint blocks movement.
  const colliders: Collider[] = [];
  for (const [entityId, rect] of [...rects.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    colliders.push({
      id: `collider_${entityId}`,
      min: { x: rect.x, y: rect.y },
      max: { x: rect.x + rect.w - 1, y: rect.y + rect.h - 1 },
      landmark_id: entityId,
    });
  }

  const map: TileMap = {
    width,
    height,
    tile_size: TILE_SIZE,
    terrain,
    colliders,
    path_cells: [],
  };

  // Regions from zones, shifted into the same tile space.
  const regions: GameRegion[] = [...placed.zones]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((zone) => {
      const halfW = zone.bounds.size.x / 2;
      const halfH = zone.bounds.size.y / 2;
      const minX = Math.round((zone.bounds.center.x - halfW) / TILE_SIZE) + shiftX;
      const minY = Math.round((zone.bounds.center.y - halfH) / TILE_SIZE) + shiftY;
      const maxX = Math.round((zone.bounds.center.x + halfW) / TILE_SIZE) + shiftX;
      const maxY = Math.round((zone.bounds.center.y + halfH) / TILE_SIZE) + shiftY;
      return {
        id: zone.id,
        label: zone.label,
        min: { x: Math.max(0, minX), y: Math.max(0, minY) },
        max: { x: Math.min(width - 1, maxX), y: Math.min(height - 1, maxY) },
        zone_id: zone.id,
      };
    });

  // Entrances.
  const placements: LandmarkPlacement[] = [];
  const entranceByEntity = new Map<string, TileCoord>();
  for (const [entityId, rect] of [...rects.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const entrance = findEntrance(map, rect);
    entranceByEntity.set(entityId, entrance);
    const entity = placed.entities.find((e) => e.id === entityId);
    placements.push({
      entityId,
      anchor: { x: rect.x, y: rect.y },
      footprint: { w: rect.w, h: rect.h },
      entrance,
      regionId: entity?.zone ?? null,
    });
  }

  // Carve paths between connected landmarks.
  const pathCells = new Set<string>();
  const connections = [...placed.connections].sort((a, b) => a.id.localeCompare(b.id));
  for (const connection of connections) {
    const gameplay = resolveEdgeGameplay(connection.semantic_type);
    if (!gameplay.carvesPath) continue;

    const from = entranceByEntity.get(connection.from);
    const to = entranceByEntity.get(connection.to);
    if (!from || !to) continue;

    const path = astar(map, from, to);
    if (!path) continue;

    for (const cell of path) {
      pathCells.add(`${cell.x},${cell.y}`);
      const index = tileIndex(map, cell.x, cell.y);
      if (terrain[index] === 'grass') terrain[index] = 'path';
    }
  }

  map.path_cells = [...pathCells]
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: x!, y: y! };
    })
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  return { map, regions, placements };
}
