import type { Vec2 } from './types';

class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(p: number, v: number) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop(): number {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top[1];
  }
}

export type Blocked = (x: number, y: number) => boolean;

/** A* on a tile grid. Returns tiles from (excluding) start to (including) goal, or null. */
export function findPath(w: number, h: number, blocked: Blocked, start: Vec2, goal: Vec2, diag = false): Vec2[] | null {
  const [sx, sy] = start, [gx, gy] = goal;
  if (blocked(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];
  const N = w * h, S = sy * w + sx;
  const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const hf = (x: number, y: number) => (diag ? Math.max(Math.abs(x - gx), Math.abs(y - gy)) : Math.abs(x - gx) + Math.abs(y - gy));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(diag ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
  const open = new Heap(); g[S] = 0; open.push(hf(sx, sy), S);
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % w, cy = (cur / w) | 0;
    if (cx === gx && cy === gy) {
      const out: Vec2[] = [];
      for (let c = cur; c !== S; c = prev[c]) out.push([c % w, (c / w) | 0]);
      return out.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked(nx, ny)) continue;
      if (dx && dy && (blocked(cx + dx, cy) || blocked(cx, cy + dy))) continue; // no corner cutting
      const ni = ny * w + nx, ng = g[cur] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; prev[ni] = cur; open.push(ng + hf(nx, ny), ni); }
    }
  }
  return null;
}

/** Nearest unblocked tile to p (ring search). */
export function nearestFree(w: number, h: number, blocked: Blocked, p: Vec2, maxR = 6): Vec2 | null {
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p[0] + dx, y = p[1] + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && !blocked(x, y)) return [x, y];
      }
  return null;
}
