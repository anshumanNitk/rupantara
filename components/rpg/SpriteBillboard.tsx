'use client';

import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { SpriteDescriptor } from '@/game/registries/spriteRegistry';

/**
 * Sprite billboard — a camera-facing character/prop sprite.
 *
 * Uses procedural placeholder geometry (a small palette + silhouette) so the
 * world renders with zero external assets. When a sprite sheet is available it
 * is resolved through the asset manifest and swapped in without changing this
 * component's contract.
 */

export interface SpriteBillboardProps {
  sprite: SpriteDescriptor;
  position: { x: number; y: number; z: number };
  /** Facing in radians around Y. */
  rotationY?: number;
  scale?: number;
  label?: string;
  labelColor?: string;
  highlighted?: boolean;
  onClick?: () => void;
}

export function SpriteBillboard({
  sprite,
  position,
  rotationY = 0,
  scale = 1,
  label,
  labelColor = '#f4f6fb',
  highlighted = false,
  onClick,
}: SpriteBillboardProps) {
  const bodyColor = highlighted ? '#ffffff' : sprite.body;

  const silhouette = useMemo(() => {
    switch (sprite.silhouette) {
      case 'robed':
        return { body: [0.5, 1.1, 0.5] as const, head: 0.26, hat: true };
      case 'armored':
        return { body: [0.6, 1.0, 0.6] as const, head: 0.24, hat: false };
      case 'carrying':
        return { body: [0.5, 0.95, 0.5] as const, head: 0.24, hat: false };
      case 'floating':
        return { body: [0.45, 0.8, 0.45] as const, head: 0.26, hat: false };
      case 'humanoid':
      default:
        return { body: [0.5, 1.0, 0.5] as const, head: 0.25, hat: false };
    }
  }, [sprite.silhouette]);

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotationY, 0]} scale={scale}>
      <group onClick={onClick}>
        {/* Body */}
        <mesh castShadow position={[0, silhouette.body[1] / 2, 0]}>
          <boxGeometry args={[silhouette.body[0], silhouette.body[1], silhouette.body[2]]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        {/* Head */}
        <mesh castShadow position={[0, silhouette.body[1] + silhouette.head, 0]}>
          <boxGeometry args={[silhouette.head * 2, silhouette.head * 2, silhouette.head * 2]} />
          <meshStandardMaterial color={sprite.body} roughness={0.8} />
        </mesh>
        {/* Accent trim / hat */}
        {silhouette.hat && (
          <mesh position={[0, silhouette.body[1] + silhouette.head * 2.4, 0]}>
            <coneGeometry args={[silhouette.head * 1.6, silhouette.head * 1.6, 6]} />
            <meshStandardMaterial color={sprite.accent} roughness={0.6} />
          </mesh>
        )}
        {/* Accent sash */}
        <mesh position={[0, silhouette.body[1] * 0.6, silhouette.body[2] / 2 + 0.01]}>
          <boxGeometry args={[silhouette.body[0] * 0.9, 0.12, 0.02]} />
          <meshStandardMaterial color={sprite.accent} emissive={sprite.accent} emissiveIntensity={0.2} />
        </mesh>
      </group>

      {label && (
        <Billboard position={[0, silhouette.body[1] + silhouette.head * 3 + 0.6, 0]}>
          <Text
            fontSize={0.42}
            color={labelColor}
            outlineWidth={0.02}
            outlineColor="#0b0f16"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
