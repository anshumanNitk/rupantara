import type { TileCoord } from '../schemas/common';
import { isWalkable, inBounds, type TileMap } from '../schemas/tilemap';

/**
 * Grid utilities for the deterministic game compiler.
 *
 * All pathfinding is 4-connected and deterministic: neighbour order is fixed
 * and ties are broken by (f, y, x). Same input => same path, always.
 */

/** Fixed neighbour order: north, east, south, west. */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
}

/** Minimal binary min-heap keyed by (f, y, x) for deterministic ordering. */
class MinHeap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private less(a: Node, b: Node): boolean {
    if (a.f !== b.f) return a.f < b.f;
    if (a.y !== b.y) return a.y < b.y;
    return a.x < b.x;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(this.items[i]!, this.items[parent]!)) break;
      [this.items[i], this.items[parent]] = [this.items[parent]!, this.items[i]!];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const n = this.items.length;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(this.items[left]!, this.items[smallest]!)) smallest = left;
      if (right < n && this.less(this.items[right]!, this.items[smallest]!)) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest]!, this.items[i]!];
      i = smallest;
    }
  }
}

function key(x: number, y: number): number {
  return y * 100000 + x;
}

/**
 * A* over walkable tiles. Returns the path including both endpoints, or null
 * when no route exists.
 */
export function astar(map: TileMap, start: TileCoord, goal: TileCoord): TileCoord[] | null {
  if (!isWalkable(map, start.x, start.y) || !isWalkable(map, goal.x, goal.y)) return null;

  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();

  const heuristic = (x: number, y: number): number => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  gScore.set(key(start.x, start.y), 0);
  open.push({ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) });

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current.x, current.y);

    if (current.x === goal.x && current.y === goal.y) {
      return reconstruct(cameFrom, currentKey, start);
    }

    const best = gScore.get(currentKey);
    if (best !== undefined && current.g > best) continue;

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isWalkable(map, nx, ny)) continue;

      const tentative = current.g + 1;
      const nKey = key(nx, ny);
      const known = gScore.get(nKey);
      if (known !== undefined && tentative >= known) continue;

      gScore.set(nKey, tentative);
      cameFrom.set(nKey, currentKey);
      open.push({ x: nx, y: ny, g: tentative, f: tentative + heuristic(nx, ny) });
    }
  }

  return null;
}

function reconstruct(cameFrom: Map<number, number>, endKey: number, start: TileCoord): TileCoord[] {
  const path: TileCoord[] = [];
  let cursor: number | undefined = endKey;
  const startKey = key(start.x, start.y);

  while (cursor !== undefined) {
    const x = cursor % 100000;
    const y = Math.floor(cursor / 100000);
    path.push({ x, y });
    if (cursor === startKey) break;
    cursor = cameFrom.get(cursor);
  }

  return path.reverse();
}

/** Breadth-first search for the nearest walkable tile to (x, y). */
export function nearestWalkable(map: TileMap, x: number, y: number): TileCoord | null {
  if (isWalkable(map, x, y)) return { x, y };

  const visited = new Set<number>([key(x, y)]);
  const queue: TileCoord[] = [{ x, y }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      if (isWalkable(map, nx, ny)) return { x: nx, y: ny };
      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}
