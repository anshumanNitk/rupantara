import type { PlacedWorld } from '@/world/schemas/world';
import type { GamePack } from '../schemas/gamePack';
import { GamePackSchema } from '../schemas/gamePack';
import type { NarrativeGraph } from '../schemas/narrative';
import { isWalkable } from '../schemas/tilemap';
import { resolveTheme } from '../registries/themeRegistry';
import { DEFAULT_ASSET_MANIFEST } from '../registries/assetResolver';
import { compileMap } from './mapCompiler';
import { compileQuests } from './questCompiler';
import { compileFallbackNarrative } from './narrativeCompiler';
import { nearestWalkable } from './grid';
import { validateGamePack } from './validators';

/**
 * Game compiler — the deterministic adapter from the architecture world to the
 * RPG game pack.
 *
 *   PlacedWorld + theme + seed -> GamePack
 *
 * Same input + same seed => byte-identical GamePack. This is the ONLY place
 * that decides tile coordinates, collision, routing and quest structure. It
 * contains no repository-specific logic.
 */

export interface GameCompileOptions {
  /** Theme id resolved through the theme registry. */
  themeId?: string;
  /** Overrides the seed derived from the world. */
  seed?: number;
  /** When false, external assets are not referenced. */
  allowExternalAssets?: boolean;
  /**
   * A narrative produced by the Narrative Agent. When supplied it is used as
   * the story layer; otherwise a deterministic fallback story is compiled so
   * the world always has soul.
   */
  narrative?: NarrativeGraph | null;
}

/** Stable 32-bit fingerprint of a placed world (FNV-1a over canonical JSON). */
export function fingerprintWorld(placed: PlacedWorld): string {
  const canonical = JSON.stringify({
    world: placed.world,
    entities: [...placed.entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => [e.id, e.semantic_type, e.zone, e.resolved_position]),
    connections: [...placed.connections]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => [c.id, c.from, c.to, c.semantic_type]),
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function chooseSpawn(
  map: ReturnType<typeof compileMap>['map'],
  guideEntrance: { x: number; y: number } | null,
  occupied: Set<string>,
): { x: number; y: number } {
  const free = (x: number, y: number): boolean =>
    isWalkable(map, x, y) && !occupied.has(`${x},${y}`);

  // Prefer a walkable tile adjacent to the guide so the player starts near the
  // guide without standing on the same tile or on a landmark entrance.
  if (guideEntrance) {
    const neighbours: Array<[number, number]> = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ];
    for (const [dx, dy] of neighbours) {
      const x = guideEntrance.x + dx;
      const y = guideEntrance.y + dy;
      if (free(x, y)) return { x, y };
    }
    if (free(guideEntrance.x, guideEntrance.y)) return guideEntrance;
  }

  const centerX = Math.floor(map.width / 2);
  const centerY = Math.floor(map.height / 2);
  const near = nearestWalkable(map, centerX, centerY);
  if (near && free(near.x, near.y)) return near;

  // Last resort: first free walkable tile in row-major order.
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (free(x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export function compileGamePack(
  placed: PlacedWorld,
  options: GameCompileOptions = {},
): GamePack {
  const theme = resolveTheme(options.themeId);
  const seed = options.seed ?? placed.world.seed;

  const { map, regions, placements } = compileMap(placed);
  const { landmarks, npcs, interactions, quests, dialogues, guideNpcId } = compileQuests(
    placed,
    placements,
    map,
  );

  const guide = guideNpcId ? npcs.find((n) => n.id === guideNpcId) ?? null : null;
  const occupied = new Set<string>([
    ...npcs.map((n) => `${n.position.x},${n.position.y}`),
    ...landmarks.map((l) => `${l.entrance.x},${l.entrance.y}`),
  ]);
  const spawnPosition = chooseSpawn(map, guide?.position ?? null, occupied);

  // The story layer: use the agent's narrative when supplied, else compile a
  // deterministic fallback so the world always has soul.
  const narrative =
    options.narrative ??
    compileFallbackNarrative({ placed, landmarks, npcs, guideNpcId });

  const pack: GamePack = {
    schema_version: '1.0',
    world: {
      id: placed.world.id,
      name: placed.world.name,
      seed,
      fingerprint: fingerprintWorld(placed),
    },
    theme,
    map,
    regions,
    landmarks,
    npcs,
    quests,
    interactions,
    dialogues,
    spawn: { position: spawnPosition, facing: 'south' },
    assets: DEFAULT_ASSET_MANIFEST,
    narrative,
  };

  // Validate the fully-built pack. Invalid packs never reach the renderer.
  const parsed = GamePackSchema.parse(pack);
  const errors = validateGamePack(parsed);
  if (errors.length > 0) {
    throw new Error(`Game compilation produced an invalid pack:\n  - ${errors.join('\n  - ')}`);
  }

  return parsed;
}
