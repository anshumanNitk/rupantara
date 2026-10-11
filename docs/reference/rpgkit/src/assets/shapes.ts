import type { ShapeSpec } from '../core/types';

// Procedural "macros": reusable object grammars. Add your own with defineMacro().
// Conventions: y is up, primitives are positioned by BASE CENTER, origin = footprint center on the ground.
export type MacroFn = (s: ShapeSpec) => ShapeSpec[];
export interface MacroDef { fn: MacroFn; aliases: string[] }
export const MACROS: Record<string, MacroDef> = {};
export const PRIMITIVES = ['box', 'cylinder', 'cone', 'pyramid', 'sphere', 'group'];

export function defineMacro(name: string, aliases: string[], fn: MacroFn) {
  MACROS[name] = { fn, aliases };
}

const B = (position: [number, number, number], size: [number, number, number], color: string): ShapeSpec => ({ type: 'box', position, size, color });

defineMacro('tree', ['oak', 'pine', 'bush', 'plant'], (s) => {
  const h = s.height ?? 2.2, c = s.color ?? '#2a9d8f';
  return [
    { type: 'cylinder', position: [0, 0, 0], radius: 0.12, height: h * 0.4, color: '#7b5a3a', segments: 8 },
    { type: 'cone', position: [0, h * 0.3, 0], radius: h * 0.28, height: h * 0.5, color: c, segments: 8 },
    { type: 'cone', position: [0, h * 0.55, 0], radius: h * 0.2, height: h * 0.45, color: c, segments: 8 },
  ];
});
defineMacro('house', ['home', 'cottage', 'building', 'shop'], (s) => {
  const [w, h, d] = s.size ?? [3, 1.6, 3];
  return [
    B([0, 0, 0], [w, h, d], s.color ?? '#f4e4c1'),
    { type: 'pyramid', position: [0, h, 0], size: [w + 0.4, 1.2, d + 0.4], color: s.roofColor ?? '#c1440e' },
    B([0, 0, d / 2], [0.6, 1, 0.06], '#6b4423'),
  ];
});
defineMacro('table', ['desk'], (s) => {
  const c = s.color ?? '#b5835a';
  return [B([0, 0.5, 0], [0.9, 0.12, 0.6], c), ...[[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]].map(([x, z]) => B([x, 0, z], [0.08, 0.5, 0.08], '#8d6240'))];
});
defineMacro('crate', ['box', 'barrel', 'chest'], (s) => [B([0, 0, 0], [0.7, 0.6, 0.7], s.color ?? '#a47148'), B([0, 0.6, 0], [0.74, 0.08, 0.74], '#7b5a3a')]);
defineMacro('door', ['gate', 'vault door'], (s) => [B([0, 0, 0], [0.96, 1.5, 0.14], s.color ?? '#6b4423'), B([0.3, 0.7, 0.09], [0.1, 0.1, 0.05], '#ffd166')]);
defineMacro('fence', ['railing'], (s) => [B([0, 0.35, 0], [1, 0.1, 0.1], s.color ?? '#9c6b3f'), B([0, 0.65, 0], [1, 0.1, 0.1], s.color ?? '#9c6b3f'), B([-0.45, 0, 0], [0.1, 0.8, 0.1], '#7b5a3a'), B([0.45, 0, 0], [0.1, 0.8, 0.1], '#7b5a3a')]);
defineMacro('sign', ['signpost', 'notice'], () => [B([0, 0, 0], [0.08, 0.8, 0.08], '#7b5a3a'), B([0, 0.8, 0], [0.7, 0.4, 0.06], '#d9b27c')]);
defineMacro('well', [], () => [{ type: 'cylinder', position: [0, 0, 0], radius: 0.45, height: 0.6, color: '#9aa5b1', segments: 12 }, B([0, 0.6, 0], [0.9, 0.08, 0.1], '#7b5a3a')]);
defineMacro('lamp', ['lantern', 'streetlight'], () => [{ type: 'cylinder', position: [0, 0, 0], radius: 0.05, height: 1.6, color: '#444', segments: 6 }, { type: 'sphere', position: [0, 1.6, 0], radius: 0.18, color: '#ffe08a' }]);
defineMacro('bookshelf', ['shelf', 'library'], () => [B([0, 0, 0], [0.95, 1.5, 0.35], '#7b5a3a'), ...[0.3, 0.7, 1.1].map((y, i) => B([0, y, 0.05], [0.85, 0.28, 0.3], ['#e76f51', '#457b9d', '#2a9d8f'][i]))]);
defineMacro('terminal', ['computer', 'console'], () => [B([0, 0, 0], [0.7, 0.5, 0.5], '#495057'), B([0, 0.5, -0.1], [0.6, 0.45, 0.08], '#212529'), B([0, 0.55, -0.05], [0.5, 0.35, 0.03], '#38b000')]);
defineMacro('server_rack', ['server', 'rack', 'database'], () => [B([0, 0, 0], [0.8, 1.7, 0.7], '#343a40'), ...[0.25, 0.6, 0.95, 1.3].map((y) => B([0, y, 0.36], [0.7, 0.2, 0.03], '#4dabf7'))]);
defineMacro('tower', ['keep', 'castle'], (s) => [
  B([0, 0, 0], [1.3, 2.2, 1.3], s.color ?? '#d9d9e8'), B([0, 2.2, 0], [1.5, 0.2, 1.5], '#555'),
  { type: 'pyramid', position: [0, 2.4, 0], size: [1.5, 0.9, 1.5], color: s.roofColor ?? '#c1440e' },
  B([0, 3.3, 0], [0.05, 0.6, 0.05], '#333'), B([0.17, 3.65, 0], [0.3, 0.2, 0.04], '#ef476f'),
]);
defineMacro('rock', ['stone', 'boulder'], (s) => [{ type: 'sphere', position: [0, 0, 0], radius: 0.4, color: s.color ?? '#8d99ae' }]);
defineMacro('pickup', ['key', 'gem', 'coin', 'item'], (s) => [{ type: 'sphere', position: [0, 0.25, 0], radius: 0.18, color: s.color ?? '#ffd166' }, B([0, 0, 0], [0.3, 0.06, 0.3], '#6b5a2e')]);

/** Find a macro from a free-text reference. Exact: whole ref equals a name/alias. Fuzzy: any word matches ("Oak Tree" -> tree). */
export function findMacro(ref: string, fuzzy = false): string | null {
  const norm = ref.toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (MACROS[norm]) return norm;
  for (const [name, def] of Object.entries(MACROS)) if (def.aliases.some((a) => a.toLowerCase().replace(/\s+/g, '_') === norm)) return name;
  if (!fuzzy) return null;
  const toks = ref.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  for (const [name, def] of Object.entries(MACROS)) {
    const names = [name, ...def.aliases].map((n) => n.toLowerCase().replace(/\s+/g, '_'));
    if (names.includes(norm) || toks.some((t) => names.includes(t))) return name;
  }
  return null;
}

/** Recursively expand macros into primitives/groups (pure data, renderer-agnostic). */
export function expandShape(spec: ShapeSpec, depth = 0): ShapeSpec {
  if (depth > 6) throw new Error('Shape macro recursion too deep');
  const m = MACROS[spec.type];
  if (m) return { type: 'group', position: spec.position, rotate: spec.rotate, children: m.fn(spec).map((c) => expandShape(c, depth + 1)) };
  if (spec.type === 'group') return { ...spec, children: (spec.children ?? []).map((c) => expandShape(c, depth + 1)) };
  if (!PRIMITIVES.includes(spec.type)) throw new Error(`Unknown shape type '${spec.type}'`);
  return spec;
}
