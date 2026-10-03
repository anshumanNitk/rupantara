import { z } from 'zod';
import { IdSchema, TileCoordSchema, GameProvenanceSchema } from './common';

/**
 * Landmark — a semantic architecture component rendered as an RPG location.
 *
 * A landmark is the bridge between the game and the architecture: it always
 * points back to a `PlacedWorld` entity via `architecture_entity_id`, so the
 * codex can show real provenance.
 */

export const LANDMARK_ARCHETYPES = [
  'guild_hall',
  'command_tower',
  'observatory',
  'town_hall',
  'workshop',
  'tower',
  'archive',
  'memory_vault',
  'storehouse',
  'dispatch_depot',
  'courier_station',
  'forge',
  'laboratory',
  'portal',
  'realm_gate',
  'camp',
] as const;
export const LandmarkArchetypeSchema = z.enum(LANDMARK_ARCHETYPES);
export type LandmarkArchetype = z.infer<typeof LandmarkArchetypeSchema>;

export const LandmarkSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  /** The PlacedWorld entity this landmark represents. */
  architecture_entity_id: z.string().min(1),
  /** Generic architecture concept (never a technology). */
  semantic_type: z.string().min(1),
  archetype: LandmarkArchetypeSchema,
  /** Top-left tile of the footprint. */
  anchor: TileCoordSchema,
  /** Footprint size in tiles. */
  footprint: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  /** Tile the player stands on to interact. Always walkable. */
  entrance: TileCoordSchema,
  /** Interaction offered when the player is at the entrance. */
  interaction_id: IdSchema,
  /** Region (zone) this landmark belongs to. */
  region_id: z.string().nullable().default(null),
  provenance: GameProvenanceSchema,
});
export type Landmark = z.infer<typeof LandmarkSchema>;
