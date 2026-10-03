import { z } from 'zod';

/**
 * Asset manifest — the layered asset resolution contract.
 *
 * Resolution order (first hit wins):
 *   1. local procedural primitive (always available, never fails)
 *   2. local GLB / sprite sheet shipped with the app
 *   3. external GLB / sprite sheet (CDN or asset library)
 *
 * The renderer only ever asks the resolver for an asset id; it never knows
 * where the bytes come from. This is what lets the world "import from other
 * libraries" without changing renderer logic.
 */

export const ASSET_SOURCES = ['procedural', 'local', 'external'] as const;
export const AssetSourceSchema = z.enum(ASSET_SOURCES);
export type AssetSource = z.infer<typeof AssetSourceSchema>;

export const AssetEntrySchema = z.object({
  asset_id: z.string().min(1),
  kind: z.enum(['glb', 'sprite_sheet', 'texture', 'procedural']),
  source: AssetSourceSchema,
  /** URI for local/external assets. Null for procedural. */
  uri: z.string().nullable().default(null),
  /** Procedural primitive id when source is procedural. */
  primitive: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  attribution: z.string().nullable().default(null),
  /** Optional provenance for generated assets (prompt/version). */
  generated: z
    .object({
      prompt: z.string().nullable().default(null),
      version: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  entries: z.array(AssetEntrySchema).default([]),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
