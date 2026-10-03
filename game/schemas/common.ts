import { z } from 'zod';

/**
 * Shared primitives for the RPG game domain.
 *
 * The game domain is a DETERMINISTIC INTERPRETATION of the architecture world.
 * It never carries repository-specific logic and never carries executable code.
 * Everything here is declarative data that can be validated, snapshotted and
 * diffed.
 */

export const GAME_PACK_VERSION = '1.0' as const;

/** Integer tile coordinate. The game world is a discrete grid, not free space. */
export const TileCoordSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});
export type TileCoord = z.infer<typeof TileCoordSchema>;

export const FacingSchema = z.enum(['north', 'south', 'east', 'west']);
export type Facing = z.infer<typeof FacingSchema>;

/** A stable, human-readable id. Used for every cross-reference in the pack. */
export const IdSchema = z.string().min(1);

/**
 * Provenance carried by game objects. It points back into the architecture
 * world by id; it never duplicates source content inconsistently.
 */
export const GameProvenanceSchema = z.object({
  architecture_node_id: z.string().nullable().default(null),
  architecture_edge_id: z.string().nullable().default(null),
  source: z
    .object({
      file: z.string().nullish(),
      symbol: z.string().nullish(),
      line: z.number().int().nonnegative().nullish(),
    })
    .nullish(),
});
export type GameProvenance = z.infer<typeof GameProvenanceSchema>;
