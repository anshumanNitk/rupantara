'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TileCoord } from '@/game/schemas/common';
import type { RpgTokens } from './rpgTokens';

/**
 * RPG camera controller.
 *
 * A fixed oblique orthographic camera that follows the player smoothly. The
 * angle never changes, so landmarks and sprites stay readable and pixel-crisp.
 * Camera position is snapped to a small grid to avoid sub-pixel jitter.
 */

export interface RpgCameraControllerProps {
  target: TileCoord;
  tileSize: number;
  tokens: RpgTokens;
  /** When true, the camera snaps instantly instead of easing. */
  snap?: boolean;
}

const SNAP = 0.25;

export function RpgCameraController({ target, tileSize, tokens, snap = false }: RpgCameraControllerProps) {
  const { camera } = useThree();
  const desired = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    camera.zoom = tokens.camera.zoom;
    camera.updateProjectionMatrix();
  }, [camera, tokens.camera.zoom]);

  useFrame(() => {
    const centerX = (target.x + 0.5) * tileSize;
    const centerZ = (target.y + 0.5) * tileSize;

    const distance = 60;
    const azimuth = tokens.camera.azimuth;
    const elevation = tokens.camera.elevation;

    desired.current.set(
      centerX + Math.cos(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      centerZ + Math.sin(azimuth) * Math.cos(elevation) * distance,
    );

    lookAt.current.set(centerX, 0, centerZ);

    if (snap) {
      camera.position.copy(desired.current);
    } else {
      camera.position.lerp(desired.current, 0.12);
    }

    // Snap to a small grid to keep the pixel look stable.
    camera.position.x = Math.round(camera.position.x / SNAP) * SNAP;
    camera.position.z = Math.round(camera.position.z / SNAP) * SNAP;

    camera.lookAt(lookAt.current);
  });

  return null;
}
