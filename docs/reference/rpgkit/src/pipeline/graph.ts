import { slug, stem } from './util';

// ============================================================================
// RepoGraph: files -> modules (districts) -> dependency layers. Pure & deterministic (no fs, no LLM).
// ============================================================================
export interface RawFile {
  id: string; // repo-relative posix path
  lang: string;
  loc: number;
  summary?: string; // first docstring / header comment line
  symbols: string[]; // top-level functions/classes/exports
  imports: string[]; // RESOLVED repo-relative file ids (internal imports only)
  isTest?: boolean;
}
export interface FileNode extends RawFile { module: string; score: number; indeg: number }
export interface ModuleNode {
  id: string; name: string; key: string; files: string[]; loc: number;
  deps: string[]; // modules this one imports from
  preDeps: string[]; // deps in a strictly lower layer (cycle-safe prerequisites)
  dependents: string[];
  layer: number; // 0 = foundations; higher = builds on lower layers
}
export interface RepoGraph {
  name: string; description?: string;
  files: Record<string, FileNode>;
  modules: Record<string, ModuleNode>;
  order: string[]; // module ids: layer asc, then size desc
  entry?: string; // best-guess entry-point file id
  languages: Record<string, number>;
}
export interface BuildOptions { name: string; description?: string; maxModules?: number }

function tarjan(ids: string[], adj: Map<string, Set<string>>): Map<string, number> {
  let idx = 0, comp = 0; const index = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), stack: string[] = [], out = new Map<string, number>();
  const visit = (v: string) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) { let w: string; do { w = stack.pop()!; on.delete(w); out.set(w, comp); } while (w !== v); comp++; }
  };
  for (const v of ids) if (!index.has(v)) visit(v);
  return out;
}

export function buildGraph(raw: RawFile[], o: BuildOptions): RepoGraph {
  const maxModules = o.maxModules ?? 10;
  const src = raw.filter((f) => !f.isTest);
  const byId = new Map(src.map((f) => [f.id, f]));
  const indeg = new Map<string, number>();
  for (const f of src) for (const t of new Set(f.imports)) if (byId.has(t) && t !== f.id) indeg.set(t, (indeg.get(t) ?? 0) + 1);
  const score = (f: RawFile) => (indeg.get(f.id) ?? 0) * 3 + Math.min(f.loc, 800) / 80 + Math.min(f.symbols.length, 20) * 0.4;

  // ---- group files into modules: directory depth that yields >= 4 groups; flat repos fall back to file-level modules
  const dirOf = (id: string, d: number) => { const p = id.split('/'); p.pop(); return p.length ? p.slice(0, d).join('/') : '(root)'; };
  let depth = 1, n = 0;
  for (let d = 1; d <= 4; d++) { const c = new Set(src.map((f) => dirOf(f.id, d))).size; if (c >= 4) { depth = d; n = c; break; } if (c > n) { depth = d; n = c; } }
  const key = new Map<string, string>();
  if (n < 4 && src.length >= 6) {
    const top = new Set([...src].sort((a, b) => score(b) - score(a)).slice(0, maxModules - 1).map((f) => f.id));
    for (const f of src) key.set(f.id, top.has(f.id) ? f.id : '(misc)');
  } else for (const f of src) key.set(f.id, dirOf(f.id, depth));

  const tally = new Map<string, { files: number; loc: number }>();
  for (const f of src) { const t = tally.get(key.get(f.id)!) ?? { files: 0, loc: 0 }; t.files++; t.loc += f.loc; tally.set(key.get(f.id)!, t); }
  if (tally.size > maxModules) {
    const keep = new Set([...tally.entries()].filter(([k]) => k !== '(misc)').sort((a, b) => b[1].files * 20 + b[1].loc - (a[1].files * 20 + a[1].loc)).slice(0, maxModules - 1).map(([k]) => k));
    for (const f of src) if (!keep.has(key.get(f.id)!)) key.set(f.id, '(misc)');
  }

  // ---- module nodes (unique readable names + ids)
  const keys = [...new Set(key.values())];
  const nameOf = (k: string, parts: number) => (k === '(misc)' ? 'Misc' : k === '(root)' ? 'Root' : k.split('/').slice(-parts).join('/').replace(/\.[A-Za-z0-9]+$/, ''));
  let names = keys.map((k) => nameOf(k, 1));
  if (new Set(names).size < names.length) names = keys.map((k) => nameOf(k, 2));
  const modules: Record<string, ModuleNode> = {}; const idOfKey = new Map<string, string>();
  keys.forEach((k, i) => {
    let id = slug(k); while (modules[id]) id += '_' + i;
    idOfKey.set(k, id);
    modules[id] = { id, name: names[i], key: k, files: [], loc: 0, deps: [], preDeps: [], dependents: [], layer: 0 };
  });
  const files: Record<string, FileNode> = {}; const languages: Record<string, number> = {};
  for (const f of src) {
    const m = modules[idOfKey.get(key.get(f.id)!)!];
    m.files.push(f.id); m.loc += f.loc;
    files[f.id] = { ...f, module: m.id, score: score(f), indeg: indeg.get(f.id) ?? 0 };
    languages[f.lang] = (languages[f.lang] ?? 0) + f.loc;
  }

  // ---- module edges, SCC condensation (cycle-safe), layers
  const adj = new Map<string, Set<string>>(Object.keys(modules).map((id) => [id, new Set<string>()]));
  for (const f of Object.values(files)) for (const t of f.imports) { const tf = files[t]; if (tf && tf.module !== f.module) adj.get(f.module)!.add(tf.module); }
  for (const [a, set] of adj) for (const b of set) { modules[a].deps.push(b); modules[b].dependents.push(a); }
  const ids = Object.keys(modules), comp = tarjan(ids, adj);
  const cdeps = new Map<number, Set<number>>();
  for (const [a, set] of adj) for (const b of set) if (comp.get(a) !== comp.get(b)) { if (!cdeps.has(comp.get(a)!)) cdeps.set(comp.get(a)!, new Set()); cdeps.get(comp.get(a)!)!.add(comp.get(b)!); }
  const layerOf = new Map<number, number>();
  const lay = (c: number): number => { if (layerOf.has(c)) return layerOf.get(c)!; let l = 0; for (const d of cdeps.get(c) ?? []) l = Math.max(l, lay(d) + 1); layerOf.set(c, l); return l; };
  for (const id of ids) modules[id].layer = lay(comp.get(id)!);
  for (const m of Object.values(modules)) m.preDeps = m.deps.filter((d) => modules[d].layer < m.layer);

  // ---- entry-point guess (name heuristics + fan-out - fan-in)
  const entryScore = (f: FileNode) => {
    const b = stem(f.id).toLowerCase(); let s = 0;
    if (b === 'main' || b === '__main__') s += 5; else if (b === 'app' || b === 'cli' || b === 'server') s += 4; else if (b === 'index' || b === '__init__') s += 2.5;
    return s + f.imports.length * 0.4 - f.indeg * 0.7 + (f.id.split('/').length <= 3 ? 1 : 0);
  };
  const entry = Object.values(files).sort((a, b) => entryScore(b) - entryScore(a))[0]?.id;

  const order = ids.sort((a, b) => modules[a].layer - modules[b].layer || modules[b].loc - modules[a].loc);
  return { name: o.name, description: o.description, files, modules, order, entry, languages };
}
