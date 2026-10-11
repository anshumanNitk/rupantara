import type { TileDef, Vec2 } from '../core/types';
import { findPath } from '../core/pathfinding';
import type { RepoGraph } from './graph';
import { mulberry32 } from './util';

// ============================================================================
// Map compiler: RepoGraph -> tile grid. Fully deterministic for a given seed.
//  * one COLUMN per dependency layer (foundations on the west, high-level code on the east)
//  * one DISTRICT (plaza ring + coloured floor) per module, one 2x2 BUILDING slot per important file
//  * ROADS = A* paths between districts that depend on each other (+ spawn, + connectivity repair)
// ============================================================================
export interface District { id: string; x: number; y: number; w: number; h: number; char: string; cols: number; files: string[] }
export interface Layout {
  width: number; height: number; rows: string[];
  legend: Record<string, TileDef>;
  districts: Record<string, District>;
  buildings: Record<string, Vec2>; // file id -> top-left tile of its 2x2 footprint
  keeper: Record<string, Vec2>; sign: Record<string, Vec2>;
  spawn: Vec2; guide: Vec2; trees: Vec2[];
  roadEdges: [string, string][];
}

export const FLOORS = ['#e8d5b7', '#cdb4db', '#bde0fe', '#ffc8dd', '#fff3b0', '#b8e0d2', '#f4c27a', '#d6e2e9', '#e5b8b8', '#c3e0a8'];
const GAP = 4, MARGIN = 4, LEFT = 8, WATER = 2;

export function layoutRepo(g: RepoGraph, seed = 1, perDistrict = 12): Layout {
  const rnd = mulberry32(seed);
  const info = g.order.map((id, i) => {
    const m = g.modules[id];
    let shown = [...m.files].sort((a, b) => g.files[b].score - g.files[a].score).slice(0, perDistrict);
    if (g.entry && m.files.includes(g.entry)) shown = [g.entry, ...shown.filter((f) => f !== g.entry)].slice(0, perDistrict);
    const cols = Math.max(1, Math.ceil(Math.sqrt(shown.length))), rws = Math.ceil(shown.length / cols);
    return { id, shown, cols, W: cols * 3 + 3, H: rws * 3 + 3, layer: m.layer, char: 'abcdefghij'[i % 10] };
  });

  // ---- columns by layer
  const layers = [...new Set(info.map((d) => d.layer))].sort((a, b) => a - b);
  // one column per layer; a layer with many districts wraps into several columns so the map stays roughly square
  const MAXCOL = 56;
  const cols = layers.flatMap((l) => {
    const chunks: (typeof info)[] = []; let cur: typeof info = [], h = 0;
    for (const d of info.filter((d) => d.layer === l)) {
      if (cur.length && h + GAP + d.H > MAXCOL) { chunks.push(cur); cur = []; h = 0; }
      h += (cur.length ? GAP : 0) + d.H; cur.push(d);
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((ds) => ({ ds, w: Math.max(...ds.map((d) => d.W)), h: ds.reduce((s, d) => s + d.H, 0) + GAP * (ds.length - 1) }));
  });
  const maxH = Math.max(...cols.map((c) => c.h));
  const W = MARGIN * 2 + LEFT + cols.reduce((s, c) => s + c.w, 0) + GAP * (cols.length - 1);
  const H = MARGIN * 2 + maxH;

  const grid: string[][] = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x < WATER || y < WATER || x >= W - WATER || y >= H - WATER ? '~' : rnd() < 0.18 ? ',' : '.')));
  const districts: Record<string, District> = {};
  const occupied = new Uint8Array(W * H); // districts (ring+interior) + water: roads never enter
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === '~') occupied[y * W + x] = 1;

  let cx = MARGIN + LEFT;
  cols.forEach((c) => {
    let cy = MARGIN + Math.floor((maxH - c.h) / 2);
    for (const d of c.ds) {
      const x0 = cx + Math.floor((c.w - d.W) / 2);
      districts[d.id] = { id: d.id, x: x0, y: cy, w: d.W, h: d.H, char: d.char, cols: d.cols, files: d.shown };
      for (let y = cy; y < cy + d.H; y++) for (let x = x0; x < x0 + d.W; x++) {
        const ring = x === x0 || y === cy || x === x0 + d.W - 1 || y === cy + d.H - 1;
        grid[y][x] = ring ? 'f' : d.char; occupied[y * W + x] = 1;
      }
      cy += d.H + GAP;
    }
    cx += c.w + GAP;
  });

  // ---- buildings, keepers, signs
  const buildings: Record<string, Vec2> = {}, keeper: Record<string, Vec2> = {}, sign: Record<string, Vec2> = {};
  for (const d of Object.values(districts)) {
    d.files.forEach((f, i) => {
      const bx = d.x + 2 + (i % d.cols) * 3, by = d.y + 2 + Math.floor(i / d.cols) * 3;
      buildings[f] = [bx, by];
    });
    keeper[d.id] = [d.x, d.y + Math.floor(d.h / 2)];
    sign[d.id] = [d.x + Math.floor(d.w / 2), d.y];
  }

  // ---- spawn: west of the first foundation district
  const first = districts[g.order[0]];
  const spawn: Vec2 = [MARGIN + 2, keeper[first.id][1]];
  const guide: Vec2 = [spawn[0], spawn[1] - 1];

  // ---- roads
  const roadGrid = new Uint8Array(W * H);
  const ringTile = (d: District, tx: number, ty: number): { ring: Vec2; out: Vec2 } => {
    let best: Vec2 = [d.x, d.y], bd = Infinity;
    for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) {
      if (!(x === d.x || y === d.y || x === d.x + d.w - 1 || y === d.y + d.h - 1)) continue;
      const dist = (x - tx) ** 2 + (y - ty) ** 2; if (dist < bd) { bd = dist; best = [x, y]; }
    }
    const out: Vec2 = best[0] === d.x ? [best[0] - 1, best[1]] : best[0] === d.x + d.w - 1 ? [best[0] + 1, best[1]] : best[1] === d.y ? [best[0], best[1] - 1] : [best[0], best[1] + 1];
    return { ring: best, out };
  };
  const center = (d: District): Vec2 => [d.x + d.w / 2, d.y + d.h / 2];
  const blocked = (x: number, y: number) => occupied[y * W + x] === 1;
  const paint = (tiles: Vec2[]) => { for (const [x, y] of tiles) { if (grid[y][x] === '.' || grid[y][x] === ',') grid[y][x] = '='; roadGrid[y * W + x] = 1; } };
  const roadEdges: [string, string][] = [];
  const connect = (a: string, b: string) => {
    const A = districts[a], B = districts[b];
    const s = ringTile(A, ...center(B)).out, e = ringTile(B, ...center(A)).out;
    const p = findPath(W, H, blocked, s, e);
    if (!p) throw new Error(`Map compiler: no road possible between ${a} and ${b}`);
    paint([s, ...p]); roadEdges.push([a, b]);
  };
  const seen = new Set<string>();
  for (const id of g.order) for (const d of g.modules[id].preDeps) { const k = `${d}|${id}`; if (!seen.has(k)) { seen.add(k); connect(d, id); } }
  // spawn road
  { const e = ringTile(first, spawn[0], spawn[1]).out; const p = findPath(W, H, blocked, spawn, e); if (!p) throw new Error('no spawn road'); paint([spawn, ...p]); }

  // connectivity repair: union-find over modules; join the nearest pair of components until one remains
  const parent = new Map(g.order.map((id) => [id, id])); const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const [a, b] of roadEdges) parent.set(find(a), find(b));
  for (;;) {
    const roots = new Set(g.order.map(find)); if (roots.size <= 1) break;
    let best: [string, string] | null = null, bd = Infinity;
    for (const a of g.order) for (const b of g.order) {
      if (find(a) === find(b)) continue;
      const [ax, ay] = center(districts[a]), [bx, by] = center(districts[b]); const d = (ax - bx) ** 2 + (ay - by) ** 2;
      if (d < bd) { bd = d; best = [a, b]; }
    }
    connect(best![0], best![1]); parent.set(find(best![0]), find(best![1]));
  }

  // ---- decorative trees: grass only, never on/next to roads or near districts/spawn
  const trees: Vec2[] = [];
  for (let y = WATER + 1; y < H - WATER - 1 && trees.length < 80; y++) for (let x = WATER + 1; x < W - WATER - 1 && trees.length < 80; x++) {
    if ((grid[y][x] !== '.' && grid[y][x] !== ',') || rnd() > 0.04) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && (roadGrid[yy * W + xx] || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && occupied[yy * W + xx]))) { near = true; break; } }
    if (!near && Math.hypot(x - spawn[0], y - spawn[1]) > 3) trees.push([x, y]);
  }

  const legend: Record<string, TileDef> = {
    '~': { terrain: 'water', walkable: false, color: '#3a86c8', height: -0.15 },
    '.': { terrain: 'grass', walkable: true, color: '#7cc576' },
    ',': { terrain: 'grass2', walkable: true, color: '#68b363' },
    '=': { terrain: 'road', walkable: true, color: '#d8c18f' },
    f: { terrain: 'plaza', walkable: true, color: '#b7bfc9' },
  };
  info.forEach((d, i) => { legend[d.char] = { terrain: `floor_${i}`, walkable: true, color: FLOORS[i % FLOORS.length] }; });

  return { width: W, height: H, rows: grid.map((r) => r.join('')), legend, districts, buildings, keeper, sign, spawn, guide, trees, roadEdges };
}
