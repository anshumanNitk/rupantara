import type { PlacedWorld } from '@/world/schemas/world';
import type { TileCoord } from '../schemas/common';
import type { GameRegion } from '../schemas/gamePack';
import type { Collider, Decoration, District, DistrictBiome, TerrainType, TileMap } from '../schemas/tilemap';
import { tileIndex } from '../schemas/tilemap';
import { resolveLandmarkRole, resolveEdgeGameplay } from '../registries/semanticWorldRegistry';
import { astar, nearestWalkable } from './grid';
import { biomeForArchetypes, biomeStyle, districtRumor, districtTitle } from './storyWorld';

/**
 * Map compiler — PlacedWorld -> a TOWN, not a diagram.
 *
 * The old compiler scattered landmarks and drew thin A* lines between them,
 * which read as an architecture diagram. This one builds a place:
 *
 *   1. every architecture ZONE becomes a DISTRICT (a town quarter with a plaza
 *      ring, a coloured floor and its own buildings),
 *   2. districts are ordered west -> east by dependency layer, so the town
 *      reads like the codebase: foundations on the west, high-level code east,
 *   3. ROADS are carved between districts that actually depend on each other,
 *   4. a water border and scattered trees frame the town.
 *
 * Deterministic: entities and zones are processed in id order, overlap
 * resolution is integer and stable, and path carving uses a deterministic A*.
 */

export const TILE_SIZE = 2;
const WATER_BORDER = 2;
const MAP_MARGIN = 3;
const DISTRICT_GAP = 4;
const CELL_PAD = 2;

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

const COMMONS_ID = 'zone_commons';

interface ZoneBucket {
  id: string;
  label: string;
  entities: PlacedWorld['entities'];
}

/** Groups entities into districts by their zone, in deterministic order. */
function groupByZone(placed: PlacedWorld): ZoneBucket[] {
  const zoneLabels = new Map(placed.zones.map((z) => [z.id, z.label]));
  const buckets = new Map<string, ZoneBucket>();

  for (const entity of [...placed.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    const zoneId = entity.zone ?? COMMONS_ID;
    let bucket = buckets.get(zoneId);
    if (!bucket) {
      bucket = {
        id: zoneId,
        label: zoneLabels.get(zoneId) ?? (zoneId === COMMONS_ID ? 'The Commons' : zoneId),
        entities: [],
      };
      buckets.set(zoneId, bucket);
    }
    bucket.entities.push(entity);
  }

  return [...buckets.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Assigns each district a dependency layer: 0 = foundation (nothing it depends
 * on), increasing eastward. Computed from the connections between districts.
 */
function districtLayers(placed: PlacedWorld, buckets: ZoneBucket[]): Map<string, number> {
  const zoneOf = new Map(placed.entities.map((e) => [e.id, e.zone ?? COMMONS_ID]));
  const ids = buckets.map((b) => b.id);
  const deps = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));

  for (const connection of [...placed.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const from = zoneOf.get(connection.from);
    const to = zoneOf.get(connection.to);
    if (!from || !to || from === to) continue;
    deps.get(to)?.add(from);
  }

  // Longest-path layering over the district DAG (cycles collapse to layer 0).
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const id of ids) {
      let best = layer.get(id) ?? 0;
      for (const dep of deps.get(id) ?? []) {
        best = Math.max(best, (layer.get(dep) ?? 0) + 1);
      }
      if (best !== layer.get(id)) {
        layer.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

interface DistrictPlan {
  bucket: ZoneBucket;
  layer: number;
  biome: DistrictBiome;
  color: string;
  rumor: string;
  label: string;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  innerW: number;
  innerH: number;
  outerW: number;
  outerH: number;
}

/** Plans each district's size from the footprints of its landmarks. */
function planDistricts(buckets: ZoneBucket[], layers: Map<string, number>): DistrictPlan[] {
  return buckets.map((bucket) => {
    const roles = bucket.entities.map((e) => resolveLandmarkRole(e.semantic_type));
    const biome = biomeForArchetypes(roles.map((r) => r.archetype));
    const style = biomeStyle(biome);
    const cellW = Math.max(3, ...roles.map((r) => r.footprint.w)) + CELL_PAD;
    const cellH = Math.max(3, ...roles.map((r) => r.footprint.h)) + CELL_PAD;
    const count = Math.max(1, bucket.entities.length);
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const innerW = cols * cellW;
    const innerH = rows * cellH;
    return {
      bucket,
      layer: layers.get(bucket.id) ?? 0,
      biome,
      color: style.color,
      rumor: districtRumor(biome, bucket.id),
      label: districtTitle(biome, bucket.id, bucket.label),
      cols,
      rows,
      cellW,
      cellH,
      innerW,
      innerH,
      outerW: innerW + 2,
      outerH: innerH + 2,
    };
  });
}

interface PlacedDistrict {
  plan: DistrictPlan;
  rect: Rect;
}

/**
 * Lays districts out in columns, one column per dependency layer, stacking
 * districts vertically within a column. This is what makes the town read
 * west -> east like the dependency graph.
 */
function layoutDistricts(plans: DistrictPlan[]): {
  districts: PlacedDistrict[];
  width: number;
  height: number;
} {
  const byLayer = new Map<number, DistrictPlan[]>();
  for (const plan of plans) {
    const list = byLayer.get(plan.layer) ?? [];
    list.push(plan);
    byLayer.set(plan.layer, list);
  }

  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const columns = layers.map((layer) => {
    const list = [...(byLayer.get(layer) ?? [])].sort((a, b) => a.bucket.id.localeCompare(b.bucket.id));
    const width = Math.max(...list.map((p) => p.outerW));
    const height = list.reduce((sum, p) => sum + p.outerH, 0) + DISTRICT_GAP * (list.length - 1);
    return { list, width, height };
  });

  const maxHeight = Math.max(...columns.map((c) => c.height));
  const totalWidth =
    WATER_BORDER * 2 +
    MAP_MARGIN * 2 +
    columns.reduce((s, c) => s + c.width, 0) +
    DISTRICT_GAP * (columns.length - 1);
  const totalHeight = WATER_BORDER * 2 + MAP_MARGIN * 2 + maxHeight;

  const districts: PlacedDistrict[] = [];
  let cursorX = WATER_BORDER + MAP_MARGIN;

  for (const column of columns) {
    let cursorY = WATER_BORDER + MAP_MARGIN + Math.floor((maxHeight - column.height) / 2);
    for (const plan of column.list) {
      const x = cursorX + Math.floor((column.width - plan.outerW) / 2);
      districts.push({ plan, rect: { x, y: cursorY, w: plan.outerW, h: plan.outerH } });
      cursorY += plan.outerH + DISTRICT_GAP;
    }
    cursorX += column.width + DISTRICT_GAP;
  }

  return { districts, width: totalWidth, height: totalHeight };
}

/** Places each landmark inside its district's interior grid. */
function placeLandmarksInDistricts(districts: PlacedDistrict[]): Map<string, Rect> {
  const rects = new Map<string, Rect>();

  for (const { plan, rect } of districts) {
    const entities = [...plan.bucket.entities].sort((a, b) => a.id.localeCompare(b.id));
    entities.forEach((entity, index) => {
      const role = resolveLandmarkRole(entity.semantic_type);
      const col = index % plan.cols;
      const row = Math.floor(index / plan.cols);
      const cellX = rect.x + 1 + col * plan.cellW;
      const cellY = rect.y + 1 + row * plan.cellH;
      const x = cellX + Math.floor((plan.cellW - role.footprint.w) / 2);
      const y = cellY + Math.floor((plan.cellH - role.footprint.h) / 2);
      rects.set(entity.id, { x, y, w: role.footprint.w, h: role.footprint.h });
    });
  }

  return rects;
}

/** Finds a walkable tile adjacent to a footprint, preferring the south edge. */
function findEntrance(map: TileMap, rect: Rect): TileCoord {
  const candidates: TileCoord[] = [];
  for (let x = rect.x; x < rect.x + rect.w; x += 1) candidates.push({ x, y: rect.y + rect.h });
  for (let y = rect.y; y < rect.y + rect.h; y += 1) candidates.push({ x: rect.x + rect.w, y });
  for (let y = rect.y; y < rect.y + rect.h; y += 1) candidates.push({ x: rect.x - 1, y });
  for (let x = rect.x; x < rect.x + rect.w; x += 1) candidates.push({ x, y: rect.y - 1 });

  for (const candidate of candidates) {
    const walkable = nearestWalkable(map, candidate.x, candidate.y);
    if (walkable) return walkable;
  }
  return { x: rect.x, y: rect.y + rect.h };
}

/** The tile on a district's ring nearest to a target point. */
function ringTile(rect: Rect, tx: number, ty: number): TileCoord {
  let best: TileCoord = { x: rect.x, y: rect.y };
  let bestDistance = Infinity;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const onRing = x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1;
      if (!onRing) continue;
      const distance = (x - tx) ** 2 + (y - ty) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return best;
}

export function compileMap(placed: PlacedWorld): MapCompileResult {
  const buckets = groupByZone(placed);
  const layers = districtLayers(placed, buckets);
  const plans = planDistricts(buckets, layers);
  const { districts, width, height } = layoutDistricts(plans);

  // --- Base terrain: water border, grass everywhere else. ---
  const terrain: TerrainType[] = new Array(width * height).fill('grass');
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < WATER_BORDER || y < WATER_BORDER || x >= width - WATER_BORDER || y >= height - WATER_BORDER) {
        terrain[tileIndex({ width }, x, y)] = 'water';
      }
    }
  }

  // --- Paint district floors + plaza rings. ---
  const districtData: District[] = [];
  for (const { plan, rect } of districts) {
    districtData.push({
      id: plan.bucket.id,
      label: plan.label,
      min: { x: rect.x, y: rect.y },
      max: { x: rect.x + rect.w - 1, y: rect.y + rect.h - 1 },
      color: plan.color,
      layer: plan.layer,
      biome: plan.biome,
      rumor: plan.rumor,
    });
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const onRing = x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1;
        terrain[tileIndex({ width }, x, y)] = onRing ? 'plaza' : 'floor';
      }
    }
  }

  // --- Place landmarks inside their districts. ---
  const rects = placeLandmarksInDistricts(districts);

  // --- Colliders: every landmark footprint blocks movement. ---
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
    districts: districtData,
    decorations: [],
  };

  // --- Regions from zones, in the same tile space. ---
  const districtByZone = new Map(districts.map((d) => [d.plan.bucket.id, d.rect]));
  const regions: GameRegion[] = [...placed.zones]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((zone) => {
      const rect = districtByZone.get(zone.id);
      if (rect) {
        const plan = districts.find((d) => d.plan.bucket.id === zone.id)?.plan;
        return {
          id: zone.id,
          label: plan?.label ?? zone.label,
          min: { x: rect.x, y: rect.y },
          max: { x: rect.x + rect.w - 1, y: rect.y + rect.h - 1 },
          zone_id: zone.id,
        };
      }
      const halfW = zone.bounds.size.x / 2;
      const halfH = zone.bounds.size.y / 2;
      const minX = Math.round((zone.bounds.center.x - halfW) / TILE_SIZE);
      const minY = Math.round((zone.bounds.center.y - halfH) / TILE_SIZE);
      const maxX = Math.round((zone.bounds.center.x + halfW) / TILE_SIZE);
      const maxY = Math.round((zone.bounds.center.y + halfH) / TILE_SIZE);
      return {
        id: zone.id,
        label: zone.label,
        min: { x: Math.max(0, minX), y: Math.max(0, minY) },
        max: { x: Math.min(width - 1, maxX), y: Math.min(height - 1, maxY) },
        zone_id: zone.id,
      };
    });

  // --- Entrances. ---
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

  // --- Roads: connect districts that depend on each other. ---
  const pathCells = new Set<string>();
  const zoneOf = new Map(placed.entities.map((e) => [e.id, e.zone ?? COMMONS_ID]));
  const districtRect = new Map(districts.map((d) => [d.plan.bucket.id, d.rect]));
  const roadEdges = new Set<string>();

  const paintRoad = (tiles: TileCoord[]): void => {
    for (const cell of tiles) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
      const index = tileIndex({ width }, cell.x, cell.y);
      if (terrain[index] === 'grass') terrain[index] = 'path';
      pathCells.add(`${cell.x},${cell.y}`);
    }
  };

  const connectDistricts = (aId: string, bId: string): void => {
    const a = districtRect.get(aId);
    const b = districtRect.get(bId);
    if (!a || !b) return;
    const aCenter = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bCenter = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const start = ringTile(a, bCenter.x, bCenter.y);
    const end = ringTile(b, aCenter.x, aCenter.y);
    const path = astar(map, start, end);
    if (!path) return;
    paintRoad([start, ...path]);
    roadEdges.add(`${aId}|${bId}`);
  };

  for (const connection of [...placed.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const gameplay = resolveEdgeGameplay(connection.semantic_type);
    if (!gameplay.carvesPath) continue;
    const from = zoneOf.get(connection.from);
    const to = zoneOf.get(connection.to);
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}`;
    if (roadEdges.has(key)) continue;
    connectDistricts(from, to);
  }

  // Connectivity repair: join the nearest pair of unconnected districts until
  // the whole town is reachable.
  const parent = new Map(districts.map((d) => [d.plan.bucket.id, d.plan.bucket.id]));
  const find = (x: string): string => {
    const p = parent.get(x);
    if (p === undefined || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const edge of roadEdges) {
    const [a, b] = edge.split('|');
    if (a && b) parent.set(find(a), find(b));
  }
  for (let guard = 0; guard < districts.length; guard += 1) {
    const roots = new Set(districts.map((d) => find(d.plan.bucket.id)));
    if (roots.size <= 1) break;
    let best: [string, string] | null = null;
    let bestDistance = Infinity;
    for (const a of districts) {
      for (const b of districts) {
        if (find(a.plan.bucket.id) === find(b.plan.bucket.id)) continue;
        const ac = { x: a.rect.x + a.rect.w / 2, y: a.rect.y + a.rect.h / 2 };
        const bc = { x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 };
        const distance = (ac.x - bc.x) ** 2 + (ac.y - bc.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [a.plan.bucket.id, b.plan.bucket.id];
        }
      }
    }
    if (!best) break;
    connectDistricts(best[0], best[1]);
    parent.set(find(best[0]), find(best[1]));
  }

  map.path_cells = [...pathCells]
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: x!, y: y! };
    })
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  // --- Decorations: biome-aware scatter on grass, never on roads. ---
  const decorations: Decoration[] = [];
  const nearestBiome = (x: number, y: number): DistrictBiome => {
    let best: DistrictBiome = 'gardens';
    let bestDistance = Infinity;
    for (const district of districts) {
      const cx = district.rect.x + district.rect.w / 2;
      const cy = district.rect.y + district.rect.h / 2;
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = district.plan.biome;
      }
    }
    return best;
  };
  const nearDistrict = (x: number, y: number): boolean =>
    districts.some(
      (d) =>
        x >= d.rect.x - 1 &&
        x < d.rect.x + d.rect.w + 1 &&
        y >= d.rect.y - 1 &&
        y < d.rect.y + d.rect.h + 1,
    );

  for (let y = WATER_BORDER + 1; y < height - WATER_BORDER - 1 && decorations.length < 110; y += 1) {
    for (let x = WATER_BORDER + 1; x < width - WATER_BORDER - 1 && decorations.length < 110; x += 1) {
      const index = tileIndex({ width }, x, y);
      if (terrain[index] !== 'grass') continue;
      if (pathCells.has(`${x},${y}`)) continue;
      if (nearDistrict(x, y)) continue;
      const hash = (Math.imul((x * 73856093) ^ (y * 19349663), 0x45d9f3b) >>> 0) % 100;
      if (hash >= 8) continue;
      const biome = nearestBiome(x, y);
      const kind = hash % 5 === 0 ? 'rock' : biomeStyle(biome).treeKind;
      decorations.push({ kind, position: { x, y } });
    }
  }
  map.decorations = decorations;

  return { map, regions, placements };
}
