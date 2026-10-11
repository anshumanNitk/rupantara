'use client';

import { useEffect, useState } from 'react';
import type { Object3D } from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { Landmark } from '@/game/schemas/landmark';
import type { Theme } from '@/game/schemas/theme';
import { tileToWorld } from './rpgGeometry';
import { resolveLandmarkMesh } from './landmarkArchetypes';
import { useResolvedAsset } from './AssetResolverContext';

/**
 * Landmark renderer.
 *
 * Renders one semantic landmark from data. It resolves the archetype through
 * the landmark mesh registry and never branches on repository identity. Quest
 * state and interaction focus are passed in as plain props.
 *
 * Asset resolution goes through the provider chain: a curated or generated GLB
 * is used when available, otherwise the procedural archetype mesh is drawn. The
 * renderer never knows which provider served the asset.
 */

export interface LandmarkRendererProps {
  landmark: Landmark;
  theme: Theme;
  tileSize: number;
  /** Whether the player is currently in interaction range. */
  focused?: boolean;
  /** Whether this landmark's objective is complete. */
  completed?: boolean;
  onSelect?: (landmarkId: string) => void;
}

export function LandmarkRenderer({
  landmark,
  theme,
  tileSize,
  focused = false,
  completed = false,
  onSelect,
}: LandmarkRendererProps) {
  const Mesh = resolveLandmarkMesh(landmark.archetype);
  const width = landmark.footprint.w * tileSize;
  const depth = landmark.footprint.h * tileSize;
  const center = tileToWorld(
    {
      x: landmark.anchor.x + landmark.footprint.w / 2,
      y: landmark.anchor.y + landmark.footprint.h / 2,
    },
    tileSize,
  );

  // Ask the chain for a curated/generated asset. While it resolves (or when it
  // falls through to procedural) we draw the archetype mesh.
  const { resolution } = useResolvedAsset({
    ref: landmark.archetype.replace(/_/g, ' '),
    primitive: landmark.archetype,
    theme: theme.id,
  });

  const color = completed ? theme.palette.accent : theme.palette.cliff;
  const accent = theme.palette.accent;

  const useGlb = resolution?.kind === 'glb';

  return (
    <group position={[center.x, 0, center.z]}>
      <group onClick={onSelect ? () => onSelect(landmark.id) : undefined}>
        {useGlb ? (
          <GlbLandmark uri={resolution.uri} width={width} depth={depth} />
        ) : (
          <Mesh color={color} accent={accent} width={width} depth={depth} highlighted={focused} />
        )}
      </group>

      {focused && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[Math.max(width, depth) * 0.6, Math.max(width, depth) * 0.72, 32]} />
          <meshBasicMaterial color={accent} transparent opacity={0.7} side={2} />
        </mesh>
      )}

      <Billboard position={[0, 5.4, 0]}>
        <Text
          fontSize={0.5}
          color={focused ? '#ffffff' : '#e6ecf5'}
          outlineWidth={0.03}
          outlineColor="#0b0f16"
          anchorX="center"
          anchorY="middle"
        >
          {landmark.label}
        </Text>
      </Billboard>
    </group>
  );
}

/**
 * A curated/generated GLB landmark.
 *
 * Loaded lazily; while it loads (or if it fails) nothing is drawn here and the
 * caller's procedural mesh remains the fallback. This keeps a missing or slow
 * asset from ever breaking the scene.
 */
function GlbLandmark({ uri, width, depth }: { uri: string; width: number; depth: number }) {
  const [object, setObject] = useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(uri);
        if (!cancelled) setObject(gltf.scene);
      } catch {
        // Missing asset: the procedural fallback stays visible.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!object) return null;

  // Scale the model to roughly fill the landmark footprint.
  return <primitive object={object} scale={Math.max(width, depth) / 4} />;
}
