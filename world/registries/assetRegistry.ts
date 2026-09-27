import type { AssetDescriptor } from '../schemas/world';

/**
 * Asset registry — optional GLB layer.
 *
 * The World Specification references asset IDs only, never raw external URLs.
 * The resolver decides whether to use procedural geometry, a local GLB, or a
 * CDN GLB. The architecture layer never knows asset storage details.
 */

export const ASSET_REGISTRY: Record<string, AssetDescriptor> = {
  'building.airport.v1': {
    asset_id: 'building.airport.v1',
    kind: 'glb',
    uri: '/assets/buildings/airport.glb',
    license: 'CC0',
    source: 'internal-library',
  },
  'building.data_center.v1': {
    asset_id: 'building.data_center.v1',
    kind: 'glb',
    uri: '/assets/buildings/data-center.glb',
    license: 'CC0',
    source: 'internal-library',
  },
};

export type AssetResolution =
  | { kind: 'procedural'; primitive: string }
  | { kind: 'glb'; uri: string; assetId: string };

/**
 * Resolves an entity's visual asset. Falls back to procedural geometry when no
 * asset is declared or the declared asset is unknown. Never throws.
 */
export function resolveAsset(
  assetId: string | null,
  fallbackPrimitive: string,
  registry: Record<string, AssetDescriptor> = ASSET_REGISTRY,
): AssetResolution {
  if (assetId === null) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  const descriptor = registry[assetId];
  if (!descriptor || descriptor.kind !== 'glb' || descriptor.uri === null) {
    return { kind: 'procedural', primitive: fallbackPrimitive };
  }

  return { kind: 'glb', uri: descriptor.uri, assetId: descriptor.asset_id };
}