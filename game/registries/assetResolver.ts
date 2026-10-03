import type { AssetEntry, AssetManifest } from '../schemas/assetManifest';

/**
 * Layered asset resolver.
 *
 * Resolution order (first hit wins):
 *   1. local procedural primitive  — always available, never fails
 *   2. local GLB / sprite sheet    — shipped with the app
 *   3. external GLB / sprite sheet — CDN or asset library
 *   4. procedural fallback         — guaranteed non-null result
 *
 * The renderer asks for an asset id and receives a resolution. It never knows
 * whether the bytes are procedural, local or remote. This is the seam that lets
 * the world "import from other libraries" without touching renderer logic.
 */

export type AssetResolution =
  | { kind: 'procedural'; primitive: string }
  | { kind: 'glb'; uri: string; assetId: string; source: 'local' | 'external' }
  | { kind: 'sprite_sheet'; uri: string; assetId: string; source: 'local' | 'external' }
  | { kind: 'texture'; uri: string; assetId: string; source: 'local' | 'external' };

export interface AssetResolverOptions {
  /** Manifest to resolve against. Defaults to the built-in manifest. */
  manifest?: AssetManifest;
  /** When false, external assets are skipped (offline / privacy mode). */
  allowExternal?: boolean;
}

/**
 * Built-in manifest. Local entries ship with the app; external entries point at
 * a CDN. Unknown ids fall through to procedural geometry.
 */
export const DEFAULT_ASSET_MANIFEST: AssetManifest = {
  schema_version: '1.0',
  entries: [
    // --- Local procedural placeholders (always present) ---
    { asset_id: 'landmark.guild_hall', kind: 'procedural', source: 'procedural', primitive: 'guild_hall', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.archive', kind: 'procedural', source: 'procedural', primitive: 'archive', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.forge', kind: 'procedural', source: 'procedural', primitive: 'forge', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.portal', kind: 'procedural', source: 'procedural', primitive: 'portal', uri: null, license: null, attribution: null, generated: null },
    { asset_id: 'landmark.town_hall', kind: 'procedural', source: 'procedural', primitive: 'town_hall', uri: null, license: null, attribution: null, generated: null },

    // --- Local sprite sheets ---
    { asset_id: 'sprites.arcane', kind: 'sprite_sheet', source: 'local', uri: '/assets/sprites/arcane.png', primitive: null, license: 'CC0', attribution: 'internal-library', generated: null },
    { asset_id: 'sprites.verdant', kind: 'sprite_sheet', source: 'local', uri: '/assets/sprites/verdant.png', primitive: null, license: 'CC0', attribution: 'internal-library', generated: null },

    // --- External examples (skipped when allowExternal is false) ---
    { asset_id: 'landmark.tower.external', kind: 'glb', source: 'external', uri: 'https://cdn.example.com/assets/tower.glb', primitive: null, license: 'CC-BY-4.0', attribution: 'example-library', generated: null },
  ],
};

function findEntry(manifest: AssetManifest, assetId: string): AssetEntry | null {
  return manifest.entries.find((entry) => entry.asset_id === assetId) ?? null;
}

/**
 * Resolves an asset id to a concrete resolution. Never throws and never
 * returns null: the final fallback is always procedural geometry.
 */
export function resolveGameAsset(
  assetId: string | null,
  fallbackPrimitive: string,
  options: AssetResolverOptions = {},
): AssetResolution {
  const manifest = options.manifest ?? DEFAULT_ASSET_MANIFEST;
  const allowExternal = options.allowExternal ?? true;

  if (assetId === null) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  const entry = findEntry(manifest, assetId);
  if (!entry) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  if (entry.source === 'external' && !allowExternal) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  if (entry.kind === 'procedural') {
    return { kind: 'procedural', primitive: entry.primitive ?? fallbackPrimitive };
  }

  if (entry.uri === null) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  const source = entry.source === 'external' ? 'external' : 'local';

  if (entry.kind === 'glb') {
    return { kind: 'glb', uri: entry.uri, assetId: entry.asset_id, source };
  }
  if (entry.kind === 'sprite_sheet') {
    return { kind: 'sprite_sheet', uri: entry.uri, assetId: entry.asset_id, source };
  }
  return { kind: 'texture', uri: entry.uri, assetId: entry.asset_id, source };
}
