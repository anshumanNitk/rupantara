import { z } from 'zod';

/**
 * Theme — the visual + naming identity of a world.
 *
 * A theme is pure data. It maps generic architecture concepts to RPG roles and
 * supplies palette/asset hints. It NEVER special-cases a repository or a
 * technology. Adding a new look means adding a theme entry, not editing code.
 */

export const ThemeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Short flavour line shown on the title overlay. */
  tagline: z.string().default(''),
  palette: z.object({
    sky: z.string(),
    ground: z.string(),
    path: z.string(),
    water: z.string(),
    cliff: z.string(),
    accent: z.string(),
    fog: z.string(),
  }),
  /** Sprite sheet id resolved through the sprite registry. */
  sprite_sheet: z.string().default('default'),
  /** Terrain texture set id resolved through the asset manifest. */
  terrain_set: z.string().default('default'),
});
export type Theme = z.infer<typeof ThemeSchema>;
