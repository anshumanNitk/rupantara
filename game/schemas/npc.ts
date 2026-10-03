import { z } from 'zod';
import { IdSchema, TileCoordSchema, FacingSchema, GameProvenanceSchema } from './common';

/**
 * NPC — a guide or inhabitant of the world.
 *
 * NPCs are the future home of LLM dialogue. For now they carry a declarative
 * dialogue tree id and optional architecture link. The runtime never executes
 * NPC-authored code; it only resolves validated dialogue data.
 */

export const NPC_ROLES = ['guide', 'scholar', 'artisan', 'courier', 'sentinel', 'wanderer'] as const;
export const NpcRoleSchema = z.enum(NPC_ROLES);
export type NpcRole = z.infer<typeof NpcRoleSchema>;

export const NpcSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  role: NpcRoleSchema,
  /** Tile the NPC stands on. Always walkable. */
  position: TileCoordSchema,
  facing: FacingSchema.default('south'),
  /** Sprite archetype resolved through the sprite registry. */
  sprite: z.string().min(1),
  /** Dialogue tree id, resolved through the dialogue registry. */
  dialogue_id: IdSchema,
  /** Optional architecture entity this NPC explains. */
  architecture_entity_id: z.string().nullable().default(null),
  /** Quests this NPC can start or advance. */
  quest_hooks: z.array(IdSchema).default([]),
  provenance: GameProvenanceSchema,
});
export type Npc = z.infer<typeof NpcSchema>;
