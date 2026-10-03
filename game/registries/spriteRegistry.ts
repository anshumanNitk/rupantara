import type { NpcRole } from '../schemas/npc';

/**
 * Sprite registry — camera-facing character/prop sprites.
 *
 * Each entry describes a procedural placeholder (a small palette + silhouette
 * hint) that the renderer can draw without any external asset. When a sprite
 * sheet is available it is resolved through the asset manifest instead, so the
 * renderer logic never changes.
 */

export interface SpriteDescriptor {
  id: string;
  label: string;
  /** Body colour for the procedural placeholder. */
  body: string;
  /** Accent colour (hat, trim, tool). */
  accent: string;
  /** Silhouette hint used by the procedural sprite builder. */
  silhouette: 'humanoid' | 'robed' | 'armored' | 'carrying' | 'floating';
}

export const SPRITE_REGISTRY: Record<string, SpriteDescriptor> = {
  guide: { id: 'guide', label: 'Guide', body: '#e8b98a', accent: '#f5c451', silhouette: 'robed' },
  scholar: { id: 'scholar', label: 'Scholar', body: '#c9a0dc', accent: '#5b8def', silhouette: 'robed' },
  artisan: { id: 'artisan', label: 'Artisan', body: '#d9a066', accent: '#c97b3c', silhouette: 'carrying' },
  courier: { id: 'courier', label: 'Courier', body: '#8fd18f', accent: '#3ecf8e', silhouette: 'carrying' },
  sentinel: { id: 'sentinel', label: 'Sentinel', body: '#9aa7b8', accent: '#ef5b5b', silhouette: 'armored' },
  wanderer: { id: 'wanderer', label: 'Wanderer', body: '#e8b98a', accent: '#8b98ad', silhouette: 'humanoid' },
  player: { id: 'player', label: 'Player', body: '#f0d0a0', accent: '#5b8def', silhouette: 'humanoid' },
};

export const FALLBACK_SPRITE: SpriteDescriptor = SPRITE_REGISTRY.wanderer!;

export function resolveSprite(id: string): SpriteDescriptor {
  return SPRITE_REGISTRY[id] ?? FALLBACK_SPRITE;
}

export function spriteForRole(role: NpcRole): SpriteDescriptor {
  return SPRITE_REGISTRY[role] ?? FALLBACK_SPRITE;
}
