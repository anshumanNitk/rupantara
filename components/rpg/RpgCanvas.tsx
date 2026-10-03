'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import type { TileCoord, Facing } from '@/game/schemas/common';
import { RpgWorldRenderer } from './RpgWorldRenderer';
import type { RpgTokens } from './rpgTokens';

/**
 * RPG canvas — the R3F host for the game world.
 *
 * Deliberately thin: it owns the WebGL context and the orthographic camera
 * setup, then hands everything else to RpgWorldRenderer. This is the boundary
 * between "rendering is runtime" and the rest of the system.
 */

export interface RpgCanvasProps {
  pack: GamePack;
  state: GameState;
  tokens: RpgTokens;
  frozen?: boolean;
  onMove: (position: TileCoord, facing: Facing) => void;
  onSelectLandmark: (landmarkId: string) => void;
  onSelectNpc: (npcId: string) => void;
}

export function RpgCanvas({
  pack,
  state,
  tokens,
  frozen = false,
  onMove,
  onSelectLandmark,
  onSelectNpc,
}: RpgCanvasProps) {
  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: false }}
      camera={{ zoom: tokens.camera.zoom, near: 0.1, far: 500, position: [40, 40, 40] }}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <RpgWorldRenderer
          pack={pack}
          state={state}
          tokens={tokens}
          frozen={frozen}
          onMove={onMove}
          onSelectLandmark={onSelectLandmark}
          onSelectNpc={onSelectNpc}
        />
      </Suspense>
    </Canvas>
  );
}
