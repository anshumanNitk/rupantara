import type { Theme } from '../schemas/theme';

/**
 * Theme registry — deterministic, data-driven world identities.
 *
 * A theme is chosen by id (or by a deterministic default). It never depends on
 * the repository. The same architecture can be rendered as any theme.
 */

export const THEMES: Record<string, Theme> = {
  arcane_kingdom: {
    id: 'arcane_kingdom',
    label: 'Arcane Kingdom',
    tagline: 'A realm where every hall remembers a procedure.',
    palette: {
      sky: '#1b2340',
      ground: '#3f6b4a',
      path: '#b79a6a',
      water: '#2f6f8f',
      cliff: '#5a5148',
      accent: '#f5c451',
      fog: '#1b2340',
    },
    sprite_sheet: 'arcane',
    terrain_set: 'arcane',
  },
  verdant_frontier: {
    id: 'verdant_frontier',
    label: 'Verdant Frontier',
    tagline: 'Settlements strung along the trade roads.',
    palette: {
      sky: '#bfe3ff',
      ground: '#7fc47f',
      path: '#d8c08a',
      water: '#4aa3c7',
      cliff: '#8a7f6a',
      accent: '#ff8a5b',
      fog: '#cfe9ff',
    },
    sprite_sheet: 'verdant',
    terrain_set: 'verdant',
  },
};

export const DEFAULT_THEME_ID = 'arcane_kingdom';

export function resolveTheme(id: string | null | undefined): Theme {
  if (id != null && THEMES[id]) return THEMES[id]!;
  return THEMES[DEFAULT_THEME_ID]!;
}

export function listThemes(): Theme[] {
  return Object.values(THEMES);
}
