import type { AssetRequest, ShapeSpec, SpriteSpec } from '../core/types';
import { findMacro } from './shapes';

// ============================================================================
// AssetResolver: "find it here, else import it, else generate it, else placeholder".
// A provider chain; first provider that returns a result wins. Results are cached
// and tagged with `by` (provenance: which provider satisfied the request).
// ============================================================================
export type ResolvedBody =
  | { kind: 'shape'; spec: ShapeSpec }
  | { kind: 'gltf'; url: string; scale: number }
  | { kind: 'sprite'; sprite: SpriteSpec; scale: number }
  | { kind: 'placeholder'; label: string };
export type Resolved = ResolvedBody & { by: string };

export interface AssetProvider {
  name: string;
  resolve(req: AssetRequest, hint?: string): Promise<ResolvedBody | null>;
}

/** Entry in a local manifest or an external library index (Kenney, Quaternius, your own mirror...). */
export interface CatalogEntry {
  id: string;
  aliases?: string[];
  tags?: string[];
  type: 'gltf' | 'sprite';
  url: string;
  scale?: number;
  frame?: { cols: number; rows: number };
  license?: string;
  source?: string;
}

const tok = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function scoreEntry(req: AssetRequest, e: CatalogEntry): number {
  const q = new Set([...tok(req.ref ?? ''), ...(req.tags ?? []).flatMap(tok)]);
  if (!q.size) return 0;
  const names = [e.id, ...(e.aliases ?? [])];
  if (req.ref && names.some((n) => tok(n).join('_') === tok(req.ref!).join('_'))) return 1;
  const et = new Set([...names, ...(e.tags ?? [])].flatMap(tok));
  let hit = 0;
  q.forEach((t) => et.has(t) && hit++);
  return hit / q.size;
}

/** Inline shapes/sprites + built-in procedural macros. Zero cost, fully deterministic. */
export class ProceduralProvider implements AssetProvider {
  /** fuzzy=false: only exact macro names/aliases (so richer catalog art can win for specific requests).
   *  fuzzy=true: any word may match a macro; used as a late fallback so "scifi crate" still renders something. */
  constructor(private fuzzy = false, public name = fuzzy ? 'procedural-fuzzy' : 'procedural') {}
  async resolve(req: AssetRequest): Promise<ResolvedBody | null> {
    if (req.shape) return { kind: 'shape', spec: req.tint ? { ...req.shape, color: req.tint } : req.shape };
    if (req.sprite) return { kind: 'sprite', sprite: req.sprite, scale: req.scale ?? 1 };
    if (req.ref) {
      const m = findMacro(req.ref, this.fuzzy);
      if (m) return { kind: 'shape', spec: { type: m, color: req.tint } };
    }
    return null;
  }
}

/** Local manifest OR an external catalog; `source` may be async (fetch an index lazily). */
export class CatalogProvider implements AssetProvider {
  private cache?: CatalogEntry[];
  constructor(public name: string, private source: CatalogEntry[] | (() => Promise<CatalogEntry[]>), private minScore = 0.6) {}
  async resolve(req: AssetRequest): Promise<ResolvedBody | null> {
    this.cache ??= typeof this.source === 'function' ? await this.source() : this.source;
    let best: CatalogEntry | null = null, bs = 0;
    for (const e of this.cache) { const s = scoreEntry(req, e); if (s > bs) { bs = s; best = e; } }
    if (!best || bs < this.minScore) return null;
    const scale = (req.scale ?? 1) * (best.scale ?? 1);
    return best.type === 'gltf'
      ? { kind: 'gltf', url: best.url, scale }
      : { kind: 'sprite', sprite: { url: best.url, frame: best.frame }, scale };
  }
}

/** Hook for AI generation (image/3D APIs). Return null to fall through. Cache results yourself or via resolver. */
export class GeneratorProvider implements AssetProvider {
  constructor(public name: string, private fn: (req: AssetRequest, hint?: string) => Promise<ResolvedBody | null>) {}
  resolve(req: AssetRequest, hint?: string) { return this.fn(req, hint); }
}

export class PlaceholderProvider implements AssetProvider {
  name = 'placeholder';
  async resolve(req: AssetRequest): Promise<ResolvedBody> {
    return { kind: 'placeholder', label: req.ref ?? 'missing' };
  }
}

export class AssetResolver {
  private cache = new Map<string, Promise<Resolved>>();
  /** Provenance log: which provider served which request, and who was tried first. */
  trace: { ref: string; by: string; tried: string[] }[] = [];
  constructor(public providers: AssetProvider[]) {}

  resolve(req: AssetRequest, hint?: string): Promise<Resolved> {
    const key = JSON.stringify([req, hint]);
    if (!this.cache.has(key)) this.cache.set(key, this.run(req, hint));
    return this.cache.get(key)!;
  }

  private async run(req: AssetRequest, hint?: string): Promise<Resolved> {
    const tried: string[] = [];
    for (const p of this.providers) {
      tried.push(p.name);
      try {
        const r = await p.resolve(req, hint);
        if (r) { this.trace.push({ ref: req.ref ?? '(inline)', by: p.name, tried }); return { ...r, by: p.name }; }
      } catch (err) {
        console.warn(`[assets] provider '${p.name}' failed for '${req.ref}':`, err);
      }
    }
    return { kind: 'placeholder', label: req.ref ?? 'missing', by: 'none' };
  }

  /** For agents: does anything real (non-placeholder) satisfy this? */
  async has(ref: string) { const r = await this.resolve({ ref }); return r.kind !== 'placeholder'; }
}

export interface ResolverOptions {
  manifest?: CatalogEntry[]; // your own assets
  catalogs?: { name: string; source: CatalogEntry[] | (() => Promise<CatalogEntry[]>); minScore?: number }[]; // external libraries
  generator?: GeneratorProvider; // AI fallback
}

/** procedural(exact) -> local manifest -> external catalogs -> procedural(fuzzy) -> AI generator -> placeholder */
export function createDefaultResolver(o: ResolverOptions = {}): AssetResolver {
  const chain: AssetProvider[] = [new ProceduralProvider()];
  if (o.manifest?.length) chain.push(new CatalogProvider('manifest', o.manifest, 0.5));
  for (const c of o.catalogs ?? []) chain.push(new CatalogProvider(c.name, c.source, c.minScore ?? 0.6));
  chain.push(new ProceduralProvider(true));
  if (o.generator) chain.push(o.generator);
  chain.push(new PlaceholderProvider());
  return new AssetResolver(chain);
}
