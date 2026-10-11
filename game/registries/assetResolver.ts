import type { AssetEntry, AssetManifest } from '../schemas/assetManifest';

/**
 * Provider-chain asset resolver.
 *
 * "Find it here, else import it, else generate it, else placeholder."
 *
 * A provider chain: the first provider that returns a result wins. Every result
 * is tagged with `by` (provenance: which provider served it) and cached. The
 * chain NEVER throws and NEVER returns null — the final placeholder guarantees
 * a result, so the renderer can always draw something.
 *
 * This is the abstraction that makes image generation a plug-in rather than a
 * rewrite: a `GeneratorProvider` is just one link in the chain.
 */

export type ResolvedBody =
  | { kind: 'procedural'; primitive: string }
  | { kind: 'glb'; uri: string; assetId: string; source: 'local' | 'external' }
  | { kind: 'sprite_sheet'; uri: string; assetId: string; source: 'local' | 'external' }
  | { kind: 'texture'; uri: string; assetId: string; source: 'local' | 'external' }
  | { kind: 'generated'; uri: string; assetId: string; prompt: string }
  | { kind: 'placeholder'; label: string };

export type Resolved = ResolvedBody & { by: string };

/** What an entity wants to look like. The resolver decides how to satisfy it. */
export interface AssetRequest {
  /** A free-text reference, e.g. "guild hall", "archive". */
  ref?: string;
  /** Optional tags to help matching. */
  tags?: string[];
  /** An explicit asset id (highest priority). */
  assetId?: string;
  /** A procedural primitive to fall back to. */
  primitive?: string;
  /** Theme id, used to keep generated art stylistically consistent. */
  theme?: string;
  /**
   * Opt in to AI generation for this request.
   *
   * When true, the exact procedural provider stands aside so the chain can try
   * curated catalogs and then the generator before falling back to procedural
   * geometry. This is how a landmark gets a generated image while terrain and
   * NPCs stay cheap and deterministic.
   */
  generate?: boolean;
  /** The visual role shapes an AI prompt without ever changing game logic. */
  kind?: 'landmark' | 'character' | 'ui';
}

export interface AssetProvider {
  name: string;
  resolve(req: AssetRequest, hint?: string): Promise<ResolvedBody | null>;
}

/** Entry in a local manifest or an external library index. */
export interface CatalogEntry {
  id: string;
  aliases?: string[];
  tags?: string[];
  type: 'glb' | 'sprite_sheet' | 'texture';
  url: string;
  license?: string;
  source?: string;
}

const tokenize = (value: string): string[] =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Known procedural primitives. The fuzzy procedural provider only matches these,
 * so it is a genuine late fallback rather than a catch-all that would starve the
 * generator and catalog providers.
 */
export const KNOWN_PRIMITIVES: ReadonlySet<string> = new Set([
  'guild_hall',
  'command_tower',
  'observatory',
  'town_hall',
  'workshop',
  'tower',
  'archive',
  'memory_vault',
  'storehouse',
  'dispatch_depot',
  'courier_station',
  'forge',
  'laboratory',
  'portal',
  'realm_gate',
  'camp',
  'guide',
  'scholar',
  'artisan',
  'courier',
  'sentinel',
  'wanderer',
  'player',
]);

/** Scores how well a catalog entry matches a request. 1 = exact, 0 = no match. */
export function scoreEntry(req: AssetRequest, entry: CatalogEntry): number {
  const query = new Set([...tokenize(req.ref ?? ''), ...(req.tags ?? []).flatMap(tokenize)]);
  if (query.size === 0) return 0;

  const names = [entry.id, ...(entry.aliases ?? [])];
  if (req.ref && names.some((n) => tokenize(n).join('_') === tokenize(req.ref!).join('_'))) {
    return 1;
  }

  const entryTokens = new Set([...names, ...(entry.tags ?? [])].flatMap(tokenize));
  let hits = 0;
  for (const token of query) if (entryTokens.has(token)) hits += 1;
  return hits / query.size;
}

/**
 * Procedural provider — always available, zero cost, fully deterministic.
 *
 * `fuzzy=false` (exact): only fires for an explicit `primitive` when no
 * `assetId` was requested, so a curated asset always wins over a placeholder.
 * `fuzzy=true`: matches a ref whose tokens include a KNOWN_PRIMITIVE, so it is
 * a genuine late fallback rather than a catch-all.
 */
export class ProceduralProvider implements AssetProvider {
  constructor(
    private fuzzy = false,
    public name = fuzzy ? 'procedural-fuzzy' : 'procedural',
  ) {}

  async resolve(req: AssetRequest): Promise<ResolvedBody | null> {
    if (!this.fuzzy) {
      // An explicit asset id means the caller wants a curated asset, not a
      // procedural primitive.
      if (req.assetId !== undefined) return null;
      // A request that opted in to generation must not be short-circuited by
      // the exact procedural provider, or the generator would never be reached.
      if (req.generate) return null;
      if (req.primitive) return { kind: 'procedural', primitive: req.primitive };
      return null;
    }

    if (!req.ref) return null;
    // A generation request must reach the generator, not the fuzzy fallback.
    if (req.generate) return null;
    const tokens = tokenize(req.ref);
    const match = tokens.find((token) => KNOWN_PRIMITIVES.has(token));
    return match ? { kind: 'procedural', primitive: match } : null;
  }
}

/**
 * Catalog provider — a local manifest or an external library index.
 * `source` may be async so an index can be fetched lazily.
 */
export class CatalogProvider implements AssetProvider {
  private cache?: CatalogEntry[];

  constructor(
    public name: string,
    private source: CatalogEntry[] | (() => Promise<CatalogEntry[]>),
    private minScore = 0.6,
  ) {}

  async resolve(req: AssetRequest): Promise<ResolvedBody | null> {
    this.cache ??= typeof this.source === 'function' ? await this.source() : this.source;

    // An explicit asset id is an exact lookup, not a fuzzy match.
    if (req.assetId !== undefined) {
      const exact = this.cache.find((entry) => entry.id === req.assetId);
      if (!exact) return null;
      return this.toBody(exact);
    }

    let best: CatalogEntry | null = null;
    let bestScore = 0;
    for (const entry of this.cache) {
      const score = scoreEntry(req, entry);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    if (!best || bestScore < this.minScore) return null;
    return this.toBody(best);
  }

  private toBody(entry: CatalogEntry): ResolvedBody {
    const source = entry.source === 'external' ? 'external' : 'local';
    if (entry.type === 'glb') {
      return { kind: 'glb', uri: entry.url, assetId: entry.id, source };
    }
    if (entry.type === 'sprite_sheet') {
      return { kind: 'sprite_sheet', uri: entry.url, assetId: entry.id, source };
    }
    return { kind: 'texture', uri: entry.url, assetId: entry.id, source };
  }
}

/**
 * Generator provider — the hook for AI image/3D generation.
 *
 * Return null to fall through to the next provider. The generator is expected
 * to cache its own results (or rely on the resolver's cache) so the same
 * request is only generated once.
 */
export class GeneratorProvider implements AssetProvider {
  constructor(
    public name: string,
    private fn: (req: AssetRequest, hint?: string) => Promise<ResolvedBody | null>,
  ) {}

  resolve(req: AssetRequest, hint?: string): Promise<ResolvedBody | null> {
    return this.fn(req, hint);
  }
}

/** Placeholder provider — the guaranteed final link. Never returns null. */
export class PlaceholderProvider implements AssetProvider {
  name = 'placeholder';

  async resolve(req: AssetRequest): Promise<ResolvedBody> {
    return { kind: 'placeholder', label: req.ref ?? req.assetId ?? 'missing' };
  }
}

export interface ResolverTrace {
  ref: string;
  by: string;
  tried: string[];
}

export class AssetResolver {
  private cache = new Map<string, Promise<Resolved>>();
  /** Provenance log: which provider served which request, and who was tried. */
  trace: ResolverTrace[] = [];

  constructor(public providers: AssetProvider[]) {}

  resolve(req: AssetRequest, hint?: string): Promise<Resolved> {
    const key = JSON.stringify([req, hint]);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.run(req, hint);
      this.cache.set(key, pending);
    }
    return pending;
  }

  private async run(req: AssetRequest, hint?: string): Promise<Resolved> {
    const tried: string[] = [];
    for (const provider of this.providers) {
      tried.push(provider.name);
      try {
        const result = await provider.resolve(req, hint);
        if (result) {
          this.trace.push({ ref: req.ref ?? req.assetId ?? '(inline)', by: provider.name, tried });
          return { ...result, by: provider.name };
        }
      } catch (error) {
        // A failing provider must never break the chain.
        console.warn(`[assets] provider '${provider.name}' failed for '${req.ref ?? req.assetId}':`, error);
      }
    }
    return { kind: 'placeholder', label: req.ref ?? req.assetId ?? 'missing', by: 'none' };
  }

  /** For agents: does anything real (non-placeholder) satisfy this request? */
  async has(ref: string): Promise<boolean> {
    const result = await this.resolve({ ref });
    return result.kind !== 'placeholder';
  }

  /** A human-readable report of which provider served what. */
  assetReport(): ResolverTrace[] {
    return [...this.trace];
  }
}

export interface ResolverOptions {
  /** Your own curated assets. */
  manifest?: CatalogEntry[];
  /** External libraries (Kenney, Quaternius, your own mirror). */
  catalogs?: { name: string; source: CatalogEntry[] | (() => Promise<CatalogEntry[]>); minScore?: number }[];
  /** The AI generation hook. */
  generator?: GeneratorProvider;
}

/**
 * Builds the default chain:
 *   procedural(exact) -> manifest -> external catalogs -> procedural(fuzzy)
 *   -> AI generator -> placeholder
 */
export function createDefaultResolver(options: ResolverOptions = {}): AssetResolver {
  const chain: AssetProvider[] = [new ProceduralProvider()];
  if (options.manifest?.length) chain.push(new CatalogProvider('manifest', options.manifest, 0.5));
  for (const catalog of options.catalogs ?? []) {
    chain.push(new CatalogProvider(catalog.name, catalog.source, catalog.minScore ?? 0.6));
  }
  chain.push(new ProceduralProvider(true));
  if (options.generator) chain.push(options.generator);
  chain.push(new PlaceholderProvider());
  return new AssetResolver(chain);
}

/**
 * Builds the full production chain for a theme:
 *   procedural(exact) -> curated theme catalog -> procedural(fuzzy)
 *   -> image generator -> placeholder
 *
 * The generator is optional: when omitted (or when the server has no image
 * provider configured) the chain simply falls through to the placeholder, so
 * the world always renders.
 */
export function createThemeResolver(
  themeId: string | null | undefined,
  options: { catalog?: CatalogEntry[]; generator?: GeneratorProvider } = {},
): AssetResolver {
  const catalogs: ResolverOptions['catalogs'] = [];
  if (options.catalog?.length) {
    catalogs.push({ name: 'curated', source: options.catalog, minScore: 0.6 });
  }
  return createDefaultResolver({ catalogs, generator: options.generator });
}

// ---------------------------------------------------------------------------
// Backwards-compatible helpers built on the chain.
// ---------------------------------------------------------------------------

/**
 * Built-in manifest. Procedural primitives only.
 *
 * Dead local URIs (`/assets/sprites/*.png`) and placeholder CDNs used to win
 * the catalog step, 404 in the browser, and starve image generation. Real
 * curated files belong in `themeCatalogs.ts` once they actually ship.
 */
export const DEFAULT_ASSET_MANIFEST: AssetManifest = {
  schema_version: '1.0',
  entries: [
    { asset_id: 'landmark.guild_hall', kind: 'procedural', source: 'procedural', primitive: 'guild_hall', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.archive', kind: 'procedural', source: 'procedural', primitive: 'archive', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.forge', kind: 'procedural', source: 'procedural', primitive: 'forge', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.portal', kind: 'procedural', source: 'procedural', primitive: 'portal', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.town_hall', kind: 'procedural', source: 'procedural', primitive: 'town_hall', uri: null, license: null, attribution: null, generated: null },
  ],
};

/** Converts a manifest entry into a catalog entry for the chain. */
export function manifestToCatalog(manifest: AssetManifest): CatalogEntry[] {
  return manifest.entries
    .filter((entry: AssetEntry) => entry.uri !== null && entry.kind !== 'procedural')
    .map((entry: AssetEntry) => ({
      id: entry.asset_id,
      type: entry.kind as CatalogEntry['type'],
      url: entry.uri!,
      license: entry.license ?? undefined,
      source: entry.source === 'external' ? 'external' : 'local',
    }));
}

export interface AssetResolverOptions {
  manifest?: AssetManifest;
  allowExternal?: boolean;
}

/**
 * Backwards-compatible single-shot resolver.
 *
 * Kept so existing callers keep working; internally it builds a chain and runs
 * one request through it. New code should use `createDefaultResolver` directly
 * so results are cached and provenance is tracked.
 */
export async function resolveGameAsset(
  assetId: string | null,
  fallbackPrimitive: string,
  options: AssetResolverOptions = {},
): Promise<Resolved> {
  const manifest = options.manifest ?? DEFAULT_ASSET_MANIFEST;
  const allowExternal = options.allowExternal ?? true;

  const entries = manifestToCatalog(manifest).filter(
    (entry) => allowExternal || entry.source !== 'external',
  );

  const resolver = createDefaultResolver({ catalogs: [{ name: 'manifest', source: entries, minScore: 0.5 }] });
  const result = await resolver.resolve({ assetId: assetId ?? undefined, primitive: fallbackPrimitive });

  // Preserve the historical contract: an unknown id resolves to the caller's
  // procedural fallback rather than a bare placeholder.
  if (result.kind === 'placeholder') {
    return { kind: 'procedural', primitive: fallbackPrimitive, by: 'procedural' };
  }
  return result;
}
