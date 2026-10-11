'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AssetResolver, AssetRequest, Resolved } from '@/game/registries/assetResolver';

/**
 * Asset resolver context.
 *
 * The renderer asks the resolver for an asset and receives a resolution tagged
 * with provenance. It never knows whether the bytes are procedural, curated,
 * generated or a placeholder — that is the whole point of the chain.
 */

const AssetResolverContext = createContext<AssetResolver | null>(null);

export const AssetResolverProvider = AssetResolverContext.Provider;

export function useAssetResolver(): AssetResolver | null {
  return useContext(AssetResolverContext);
}

export interface AssetResolutionState {
  resolution: Resolved | null;
  loading: boolean;
}

/**
 * Resolves an asset request asynchronously. Returns null while loading so the
 * caller can render a procedural placeholder in the meantime.
 */
export function useResolvedAsset(request: AssetRequest | null): AssetResolutionState {
  const resolver = useAssetResolver();
  const [state, setState] = useState<AssetResolutionState>({ resolution: null, loading: false });

  const key = useMemo(() => (request ? JSON.stringify(request) : null), [request]);

  useEffect(() => {
    if (!resolver || !request) {
      setState({ resolution: null, loading: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    void resolver.resolve(request).then((resolution) => {
      if (!cancelled) setState({ resolution, loading: false });
    });

    return () => {
      cancelled = true;
    };
    // `key` captures the request identity; `request` is stable per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolver, key]);

  return state;
}
