import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Interaction — a declarative, safe action the player can trigger.
 *
 * There are NO executable script strings here. An interaction is a small,
 * closed vocabulary of verbs plus data. The runtime interprets the verb; it
 * never evaluates user- or model-authored code.
 */

export const INTERACTION_KINDS = [
  'inspect',
  'talk',
  'visit',
  'collect',
  'unlock',
] as const;
export const InteractionKindSchema = z.enum(INTERACTION_KINDS);
export type InteractionKind = z.infer<typeof InteractionKindSchema>;

/** Safe, predefined side effects an interaction may declare. */
export const INTERACTION_EFFECTS = [
  'reveal_codex',
  'start_dialogue',
  'complete_objective',
  'grant_unlock',
  'play_replay',
] as const;
export const InteractionEffectSchema = z.enum(INTERACTION_EFFECTS);
export type InteractionEffect = z.infer<typeof InteractionEffectSchema>;

export const InteractionSchema = z.object({
  id: IdSchema,
  kind: InteractionKindSchema,
  /** Prompt shown when the player is in range, e.g. "Inspect Memory Archive". */
  prompt: z.string().min(1),
  /** Architecture entity this interaction explains, if any. */
  architecture_entity_id: z.string().nullable().default(null),
  /** Dialogue tree to open for `talk` interactions. */
  dialogue_id: IdSchema.nullable().default(null),
  /** Declarative effects applied on success. */
  effects: z.array(InteractionEffectSchema).default([]),
  /** Unlock ids granted by this interaction. */
  grants: z.array(IdSchema).default([]),
});
export type Interaction = z.infer<typeof InteractionSchema>;
