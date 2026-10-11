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
 *
 * These catalogs are EMPTY by default. An entry whose URL does not resolve
 * would win the chain and then fail to load, hiding the generator behind a
 * broken asset. Add entries only when you actually ship the files.
 */

/** Curated set for the arcane theme. Add entries when you ship the assets. */
export const ARCANE_CATALOG: CatalogEntry[] = [];

/** Curated set for the verdant theme. Add entries when you ship the assets. */
export const VERDANT_CATALOG: CatalogEntry[] = [];

export const THEME_CATALOGS: Record<string, CatalogEntry[]> = {
  arcane_kingdom: ARCANE_CATALOG,
  verdant_frontier: VERDANT_CATALOG,
};

export function catalogForTheme(themeId: string | null | undefined): CatalogEntry[] {
  if (!themeId) return [];
  return THEME_CATALOGS[themeId] ?? [];
}
