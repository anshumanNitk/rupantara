import { z } from 'zod';
import { IdSchema, TileCoordSchema, FacingSchema } from './common';

/**
 * Game state — the mutable runtime state of a play session.
 *
 * This is deliberately small and serialisable. It is the only thing persisted
 * locally, keyed by a world fingerprint + pack version. It never contains raw
 * repository content.
 */

export const PlayerStateSchema = z.object({
  position: TileCoordSchema,
  facing: FacingSchema.default('south'),
  /** Landmark/NPC ids the player has discovered. */
  discovered: z.array(IdSchema).default([]),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const QuestProgressSchema = z.object({
  quest_id: IdSchema,
  /** Objective ids that are complete. */
  completed_objectives: z.array(IdSchema).default([]),
  status: z.enum(['locked', 'active', 'completed']).default('locked'),
});
export type QuestProgress = z.infer<typeof QuestProgressSchema>;

export const DialogueStateSchema = z.object({
  npc_id: IdSchema.nullable().default(null),
  node_id: IdSchema.nullable().default(null),
});
export type DialogueState = z.infer<typeof DialogueStateSchema>;

export const GameStateSchema = z.object({
  schema_version: z.literal('1.0'),
  /** Fingerprint of the world this state belongs to. */
  world_fingerprint: z.string().min(1),
  pack_version: z.string().min(1),
  player: PlayerStateSchema,
  quests: z.array(QuestProgressSchema).default([]),
  /** Unlock ids the player has earned. */
  unlocks: z.array(IdSchema).default([]),
  /** Codex entries the player has revealed. */
  codex: z.array(IdSchema).default([]),
  dialogue: DialogueStateSchema.default({ npc_id: null, node_id: null }),
  /** Accessibility / preference state. */
  preferences: z
    .object({
      reduced_motion: z.boolean().default(false),
      high_contrast: z.boolean().default(false),
    })
    .default({ reduced_motion: false, high_contrast: false }),
});
export type GameState = z.infer<typeof GameStateSchema>;
