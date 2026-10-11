import type { CatalogEntry } from './assetResolver';

/**
 * Curated theme asset catalogs.
 *
 * These are the "import from other libraries" link in the asset chain. Each
 * catalog is a plain list of entries — static, or fetched lazily from an index.
 *
 * IMPORTANT: no real third-party URLs are hard-coded here. Add the index you
 * trust and verify each licence. The shape is what matters: an id, aliases,
 * tags, a type and a URL.
 *
 * The recommended strategy (see docs/REFERENCE_ANALYSIS_AND_DYNAMIC_ASSETS.md):
 * ship a SMALL curated set per theme and let procedural geometry cover the long
 * tail, so image generation only fires for genuinely distinctive assets.
 */

/** A minimal curated set for the arcane theme. Replace URLs with your own assets. */
export const ARCANE_CATALOG: CatalogEntry[] = [
  { id: 'guild_hall', aliases: ['hall', 'guild'], tags: ['building', 'agent'], type: 'glb', url: '/assets/curated/arcane/guild-hall.glb', license: 'CC0', source: 'local' },
  { id: 'archive', aliases: ['library', 'vault'], tags: ['building', 'database'], type: 'glb', url: '/assets/curated/arcane/archive.glb', license: 'CC0', source: 'local' },
  { id: 'forge', aliases: ['workshop', 'smithy'], tags: ['building', 'tool'], type: 'glb', url: '/assets/curated/arcane/forge.glb', license: 'CC0', source: 'local' },
  { id: 'portal', aliases: ['gate', 'realm gate'], tags: ['building', 'external'], type: 'glb', url: '/assets/curated/arcane/portal.glb', license: 'CC0', source: 'local' },
  { id: 'town_hall', aliases: ['hall', 'town'], tags: ['building', 'service'], type: 'glb', url: '/assets/curated/arcane/town-hall.glb', license: 'CC0', source: 'local' },
];

/** A minimal curated set for the verdant theme. */
export const VERDANT_CATALOG: CatalogEntry[] = [
  { id: 'guild_hall', aliases: ['hall', 'guild'], tags: ['building', 'agent'], type: 'glb', url: '/assets/curated/verdant/guild-hall.glb', license: 'CC0', source: 'local' },
  { id: 'archive', aliases: ['library', 'vault'], tags: ['building', 'database'], type: 'glb', url: '/assets/curated/verdant/archive.glb', license: 'CC0', source: 'local' },
  { id: 'forge', aliases: ['workshop', 'smithy'], tags: ['building', 'tool'], type: 'glb', url: '/assets/curated/verdant/forge.glb', license: 'CC0', source: 'local' },
];

export const THEME_CATALOGS: Record<string, CatalogEntry[]> = {
  arcane_kingdom: ARCANE_CATALOG,
  verdant_frontier: VERDANT_CATALOG,
};

export function catalogForTheme(themeId: string | null | undefined): CatalogEntry[] {
  if (!themeId) return [];
  return THEME_CATALOGS[themeId] ?? [];
}
