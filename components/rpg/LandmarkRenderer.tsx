'use client';

import { useEffect, useState } from 'react';
import type { Object3D } from 'three';
import * as THREE from 'three';
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
  /** Whether this is the next beat in the player's current story mission. */
  active?: boolean;
  onSelect?: (landmarkId: string) => void;
}

export function LandmarkRenderer({
  landmark,
  theme,
  tileSize,
  focused = false,
  completed = false,
  active = false,
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

  // Ask the chain for a curated/generated asset. Landmarks opt in to AI
  // generation, so the chain tries the curated catalog and the image generator
  // before falling back to procedural geometry. While it resolves we draw the
  // archetype mesh, so the world is never empty.
  const { resolution } = useResolvedAsset({
    ref: landmark.archetype.replace(/_/g, ' '),
    primitive: landmark.archetype,
    theme: theme.id,
    generate: true,
  });

  const color = completed ? theme.palette.accent : theme.palette.cliff;
  const accent = theme.palette.accent;

  const useGlb = resolution?.kind === 'glb';
  const useImage =
    resolution?.kind === 'generated' ||
    resolution?.kind === 'sprite_sheet' ||
    resolution?.kind === 'texture';

  return (
    <group position={[center.x, 0, center.z]}>
      <group onClick={onSelect ? () => onSelect(landmark.id) : undefined}>
        {useGlb ? (
          <GlbLandmark uri={resolution.uri} width={width} depth={depth} />
        ) : useImage ? (
          <ImageLandmark uri={resolution.uri} width={width} depth={depth} />
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

      {/* Permanent component labels make the world read like a diagram. A
          landmark now speaks only when discovered/focused; an active mission
          gets a diegetic beacon instead of another floating file name. */}
      {(focused || active) && (
        <Billboard position={[0, active ? 5.6 : 5.1, 0]}>
          <Text
            fontSize={focused ? 0.46 : 0.8}
            color={focused ? '#ffffff' : accent}
            outlineWidth={0.03}
            outlineColor="#0b0f16"
            anchorX="center"
            anchorY="middle"
          >
            {focused ? landmark.label : '✦'}
          </Text>
        </Billboard>
      )}
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

/**
 * A generated/curated image landmark.
 *
 * The image is drawn as a billboard standing on the footprint, so a generated
 * sprite reads as a building without needing geometry. This is the visible
 * payoff of the image-generation provider: when the chain serves a generated
 * asset, the player sees it here.
 *
 * The background is chroma-keyed out on a canvas. Image models often draw a
 * literal checkerboard or a flat colour instead of true transparency, so we
 * remove near-magenta pixels and any checkerboard grey before drawing.
 */
function ImageLandmark({ uri, width, depth }: { uri: string; width: number; depth: number }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0);

      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = data.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        // Magenta key: strong red + blue, weak green.
        const isMagenta = r > 180 && b > 180 && g < 120;
        // Checkerboard grey: near-neutral light pixels.
        const isChecker = Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 150;
        if (isMagenta || isChecker) pixels[i + 3] = 0;
      }
      context.putImageData(data, 0, 0);

      const loaded = new THREE.CanvasTexture(canvas);
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.magFilter = THREE.NearestFilter;
      loaded.minFilter = THREE.NearestFilter;
      loaded.generateMipmaps = false;
      setTexture(loaded);
    };
    image.onerror = () => {
      // Missing image: the procedural fallback stays visible.
    };
    image.src = uri;

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!texture) return null;

  // Fit the image to the footprint: about as wide as the building and a little
  // taller, so it reads as a structure without towering over the town.
  const height = Math.max(width, depth) * 1.05;
  return (
    <sprite position={[0, height / 2, 0]} scale={[width * 0.95, height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.05} />
    </sprite>
  );
}
