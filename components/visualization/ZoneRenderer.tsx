'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { PlacedZone } from '@/world/schemas/world';

/**
 * Zone renderer — draws the coarse geographic regions derived from the
 * architecture diagram's grouping. Zones are what make "grouping affects city
 * geography" visible.
 */

export interface ZoneRendererProps {
  zone: PlacedZone;
  color?: string;
  opacity?: number;
  showLabel?: boolean;
}

export function ZoneRenderer({ zone, color = '#5b8def', opacity = 0.06, showLabel = true }: ZoneRendererProps) {
  const { center, size } = zone.bounds;

  const outlineGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(size.x, size.y)),
    [size.x, size.y],
  );

  return (
    <group position={[center.x, 0, center.y]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[size.x, size.y]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>

      <lineSegments geometry={outlineGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <lineBasicMaterial color={color} transparent opacity={Math.min(opacity * 6, 0.5)} />
      </lineSegments>

      {showLabel && (
        <Billboard position={[0, 1.5, -size.y / 2 + 2]}>
          <Text fontSize={1.6} color={color} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#0b0f16">
            {zone.label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}