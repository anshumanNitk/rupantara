import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Dialogue — declarative conversation trees.
 *
 * Dialogue is data, never code. Nodes reference each other by id and may
 * declare safe effects. This is the seam where LLM-authored dialogue will plug
 * in later: a model may propose nodes, but they must validate against this
 * schema and be grounded in the architecture graph before use.
 */

export const DialogueEffectSchema = z.enum([
  'complete_objective',
  'grant_unlock',
  'reveal_codex',
  'start_quest',
  'recruit_companion',
]);

export const DialogueChoiceSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  /** Next node id, or null to end the conversation. */
  next: IdSchema.nullable().default(null),
  effects: z.array(DialogueEffectSchema).default([]),
  /** Quest id this choice can start/advance. */
  quest_id: IdSchema.nullable().default(null),
  /** NPC who starts following the player, when this choice recruits them. */
  companion_npc_id: IdSchema.nullish(),
});
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

export const DialogueNodeSchema = z.object({
  id: IdSchema,
  speaker: z.string().min(1),
  text: z.string().min(1),
  choices: z.array(DialogueChoiceSchema).default([]),
  /** Architecture entity this node explains, if any. */
  architecture_entity_id: z.string().nullable().default(null),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueTreeSchema = z.object({
  id: IdSchema,
  npc_id: IdSchema,
  root: IdSchema,
  nodes: z.array(DialogueNodeSchema).min(1),
});
export type DialogueTree = z.infer<typeof DialogueTreeSchema>;
