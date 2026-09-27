'use client';

import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PlacedWorld } from '@/world/schemas/world';
import type { VisualStyle } from './visualStyle';

/**
 * Camera controller.
 *
 * Frames the whole world on load and on demand (reset). Camera preset comes
 * from the visual style, so style changes are purely presentational.
 */

export interface CameraControllerProps {
  world: PlacedWorld;
  style: VisualStyle;
  /** Increment to trigger a re-frame. */
  resetSignal: number;
}

function worldExtent(world: PlacedWorld): { center: [number, number, number]; radius: number } {
  if (world.entities.length === 0) {
    return { center: [0, 0, 0], radius: 40 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of world.entities) {
    minX = Math.min(minX, entity.resolved_position.x);
    maxX = Math.max(maxX, entity.resolved_position.x);
    minY = Math.min(minY, entity.resolved_position.y);
    maxY = Math.max(maxY, entity.resolved_position.y);
  }

  const center: [number, number, number] = [(minX + maxX) / 2, 0, (minY + maxY) / 2];
  const radius = Math.max(Math.hypot(maxX - minX, maxY - minY) / 2, 30);
  return { center, radius };
}

export function CameraController({ world, style, resetSignal }: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { center, radius } = worldExtent(world);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const distance = radius * (style.camera === 'top' ? 2.4 : 1.9);
    const height = style.camera === 'top' ? distance : distance * 0.75;

    controls.target.set(center[0], 0, center[2]);
    controls.object.position.set(center[0] + distance * 0.6, height, center[2] + distance * 0.6);
    controls.update();
  }, [center, radius, style.camera, resetSignal]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={10}
      maxDistance={radius * 6}
    />
  );
}