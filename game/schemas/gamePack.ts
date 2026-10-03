import { z } from 'zod';
import { GAME_PACK_VERSION, TileCoordSchema, FacingSchema } from './common';
import { TileMapSchema } from './tilemap';
import { LandmarkSchema } from './landmark';
import { NpcSchema } from './npc';
import { QuestSchema } from './quest';
import { InteractionSchema } from './interaction';
import { DialogueTreeSchema } from './dialogue';
import { ThemeSchema } from './theme';
import { AssetManifestSchema } from './assetManifest';

/**
 * GamePack — the declarative boundary between the deterministic world compiler
 * and the RPG runtime.
 *
 * A GamePack is DATA. It is never TSX, never executable, and never generated
 * by a model directly. The compiler produces it deterministically from a
 * PlacedWorld + theme + seed; validators prove it is playable before the
 * renderer ever sees it.
 */

export const GameRegionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Inclusive tile bounds of the region. */
  min: TileCoordSchema,
  max: TileCoordSchema,
  /** Architecture zone this region derives from. */
  zone_id: z.string().nullable().default(null),
});
export type GameRegion = z.infer<typeof GameRegionSchema>;

export const GamePackSchema = z.object({
  schema_version: z.literal(GAME_PACK_VERSION),
  /** Identity of the source world. */
  world: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Deterministic seed used to build the pack. */
    seed: z.number().int(),
    /** Stable fingerprint of the source PlacedWorld. */
    fingerprint: z.string().min(1),
  }),
  theme: ThemeSchema,
  map: TileMapSchema,
  regions: z.array(GameRegionSchema).default([]),
  landmarks: z.array(LandmarkSchema).default([]),
  npcs: z.array(NpcSchema).default([]),
  quests: z.array(QuestSchema).default([]),
  interactions: z.array(InteractionSchema).default([]),
  dialogues: z.array(DialogueTreeSchema).default([]),
  spawn: z.object({
    position: TileCoordSchema,
    facing: FacingSchema.default('south'),
  }),
  assets: AssetManifestSchema,
});
export type GamePack = z.infer<typeof GamePackSchema>;
