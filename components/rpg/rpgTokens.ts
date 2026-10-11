import type { Theme } from '@/game/schemas/theme';

/**
 * RPG visual tokens.
 *
 * One fixed art direction: warm fantasy/arcane-tech, 2.5D, deliberately
 * stylized. There is no style dropdown — a coherent product uses one look.
 * Tokens are derived from the theme so a theme swap changes the whole world.
 */

export interface RpgTokens {
  background: string;
  fog: { color: string; near: number; far: number };
  ambient: { intensity: number; color: string };
  directional: { intensity: number; color: string; position: [number, number, number] };
  accent: string;
  path: string;
  water: string;
  cliff: string;
  ground: string;
  /** Camera framing. */
  camera: {
    /** Orthographic zoom (world units visible vertically). */
    zoom: number;
    /** Oblique angle in radians. */
    azimuth: number;
    elevation: number;
  };
  /** Player movement speed in tiles per second. */
  playerSpeed: number;
  /** Interaction radius in tiles. */
  interactRadius: number;
}

export function tokensForTheme(theme: Theme): RpgTokens {
  return {
    background: theme.palette.sky,
    fog: { color: theme.palette.fog, near: 60, far: 220 },
    ambient: { intensity: 0.75, color: '#ffffff' },
    directional: { intensity: 1.05, color: '#fff3d6', position: [40, 80, 30] },
    accent: theme.palette.accent,
    path: theme.palette.path,
    water: theme.palette.water,
    cliff: theme.palette.cliff,
    ground: theme.palette.ground,
    camera: { zoom: 15, azimuth: Math.PI / 4, elevation: Math.PI / 5.2 },
    playerSpeed: 4.5,
    interactRadius: 1.6,
  };
}
