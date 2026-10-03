'use client';

import { Billboard, Text } from '@react-three/drei';
import type { Landmark } from '@/game/schemas/landmark';
import type { Theme } from '@/game/schemas/theme';
import { tileToWorld } from './rpgGeometry';
import { resolveLandmarkMesh } from './landmarkArchetypes';

/**
 * Landmark renderer.
 *
 * Renders one semantic landmark from data. It resolves the archetype through
 * the landmark mesh registry and never branches on repository identity. Quest
 * state and interaction focus are passed in as plain props.
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

  const color = completed ? theme.palette.accent : theme.palette.cliff;
  const accent = theme.palette.accent;

  return (
    <group position={[center.x, 0, center.z]}>
      <group onClick={onSelect ? () => onSelect(landmark.id) : undefined}>
        <Mesh color={color} accent={accent} width={width} depth={depth} highlighted={focused} />
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
