import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Quest — a dependency-aware objective chain.
 *
 * Quests are compiled deterministically from graph topology. They explain the
 * architecture: each objective points at a landmark/NPC and, where relevant,
 * an architecture concept. Prerequisites form a DAG that is validated before
 * the pack is accepted.
 */

export const OBJECTIVE_KINDS = ['visit', 'inspect', 'talk', 'collect', 'unlock'] as const;
export const ObjectiveKindSchema = z.enum(OBJECTIVE_KINDS);
export type ObjectiveKind = z.infer<typeof ObjectiveKindSchema>;

export const ObjectiveSchema = z.object({
  id: IdSchema,
  kind: ObjectiveKindSchema,
  /** Short instruction shown in the quest log. */
  description: z.string().min(1),
  /** Target landmark id, if the objective is spatial. */
  landmark_id: IdSchema.nullable().default(null),
  /** Target NPC id, if the objective is conversational. */
  npc_id: IdSchema.nullable().default(null),
  /** Interaction that satisfies this objective. */
  interaction_id: IdSchema.nullable().default(null),
  /** Architecture entity this objective teaches, if any. */
  architecture_entity_id: z.string().nullable().default(null),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const QuestSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** Ordered objectives. All must complete for the quest to complete. */
  objectives: z.array(ObjectiveSchema).min(1),
  /** Quests that must be completed first. */
  prerequisites: z.array(IdSchema).default([]),
  /** Unlock ids granted on completion. */
  rewards: z.array(IdSchema).default([]),
  /** Architecture concepts this quest explains. */
  concepts: z.array(z.string()).default([]),
  /** Whether this quest is required for the main path. */
  main_path: z.boolean().default(true),
});
export type Quest = z.infer<typeof QuestSchema>;
