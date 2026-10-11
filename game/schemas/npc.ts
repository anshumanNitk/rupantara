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

/** Visual-only patrol. Interaction still uses `position` (the home tile). */
export const NpcWanderSchema = z.object({
  /** How far, in tiles, the sprite may roam from its home tile. */
  radius: z.number().int().min(0).max(12).default(2),
  /** Tiles per second for the visual patrol. */
  speed: z.number().positive().max(4).default(0.7),
});
export type NpcWander = z.infer<typeof NpcWanderSchema>;

export const NpcSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  role: NpcRoleSchema,
  /** Home tile. Always walkable. Interaction and pathfinding use this. */
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
  /**
   * Visual patrol around the home tile. Null means the sprite stands still.
   * The reducer never sees the interpolated position, so playtests stay valid.
   */
  wander: NpcWanderSchema.nullable().default(null),
  /** Ambient townsfolk are flavour, not quest-givers. Labels hide until nearby. */
  ambient: z.boolean().default(false),
  provenance: GameProvenanceSchema,
});
export type Npc = z.infer<typeof NpcSchema>;
