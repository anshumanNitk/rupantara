'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GamePack } from '@/game/schemas/gamePack';
import type { Facing, TileCoord } from '@/game/schemas/common';
import { isWalkable } from '@/game/schemas/tilemap';
import { resolveSprite } from '@/game/registries/spriteRegistry';
import { SpriteBillboard } from './SpriteBillboard';
import type { RpgTokens } from './rpgTokens';

/**
 * Player controller.
 *
 * Fixed-timestep movement with per-axis collision checks. The authoritative
 * position is the tile in game state; this component keeps a smooth continuous
 * position for rendering and reports tile changes upward. It never mutates
 * game state directly — it emits `onMove`.
 */

export interface PlayerControllerProps {
  pack: GamePack;
  position: TileCoord;
  facing: Facing;
  tokens: RpgTokens;
  /** When true, keyboard input is ignored (e.g. dialogue open). */
  frozen?: boolean;
  onMove: (position: TileCoord, facing: Facing) => void;
}

const KEY_TO_DIRECTION: Record<string, { dx: number; dy: number; facing: Facing }> = {
  ArrowUp: { dx: 0, dy: -1, facing: 'north' },
  KeyW: { dx: 0, dy: -1, facing: 'north' },
  ArrowDown: { dx: 0, dy: 1, facing: 'south' },
  KeyS: { dx: 0, dy: 1, facing: 'south' },
  ArrowLeft: { dx: -1, dy: 0, facing: 'west' },
  KeyA: { dx: -1, dy: 0, facing: 'west' },
  ArrowRight: { dx: 1, dy: 0, facing: 'east' },
  KeyD: { dx: 1, dy: 0, facing: 'east' },
};

const FACING_ANGLE: Record<Facing, number> = {
  north: Math.PI,
  south: 0,
  east: Math.PI / 2,
  west: -Math.PI / 2,
};

export function PlayerController({
  pack,
  position,
  facing,
  tokens,
  frozen = false,
  onMove,
}: PlayerControllerProps) {
  const pressed = useRef<Set<string>>(new Set());
  const worldPos = useRef({ x: (position.x + 0.5) * pack.map.tile_size, z: (position.y + 0.5) * pack.map.tile_size });
  const lastTile = useRef<TileCoord>(position);
  const facingRef = useRef<Facing>(facing);
  const sprite = useMemo(() => resolveSprite('player'), []);

  // Sync continuous position when the authoritative tile changes externally
  // (reset, teleport, or a move applied by the reducer).
  useEffect(() => {
    if (position.x !== lastTile.current.x || position.y !== lastTile.current.y) {
      worldPos.current = {
        x: (position.x + 0.5) * pack.map.tile_size,
        z: (position.y + 0.5) * pack.map.tile_size,
      };
      lastTile.current = position;
    }
  }, [position, pack.map.tile_size]);

  useEffect(() => {
    facingRef.current = facing;
  }, [facing]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (frozen) return;
      if (KEY_TO_DIRECTION[event.code]) {
        pressed.current.add(event.code);
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      pressed.current.delete(event.code);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [frozen]);

  useFrame((_, delta) => {
    if (frozen) return;

    let dx = 0;
    let dy = 0;
    let nextFacing = facingRef.current;
    for (const code of pressed.current) {
      const dir = KEY_TO_DIRECTION[code];
      if (!dir) continue;
      dx += dir.dx;
      dy += dir.dy;
      nextFacing = dir.facing;
    }
    if (dx === 0 && dy === 0) return;

    const length = Math.hypot(dx, dy);
    const step = tokens.playerSpeed * pack.map.tile_size * Math.min(delta, 0.05);
    const moveX = (dx / length) * step;
    const moveY = (dy / length) * step;

    const tileSize = pack.map.tile_size;
    const current = worldPos.current;

    // Per-axis collision: try X, then Y, so sliding along walls works.
    const tryX = current.x + moveX;
    const tileX = Math.floor(tryX / tileSize);
    const tileYNow = Math.floor(current.z / tileSize);
    if (isWalkable(pack.map, tileX, tileYNow)) {
      current.x = tryX;
    }

    const tryZ = current.z + moveY;
    const tileZ = Math.floor(tryZ / tileSize);
    const tileXNow = Math.floor(current.x / tileSize);
    if (isWalkable(pack.map, tileXNow, tileZ)) {
      current.z = tryZ;
    }

    const newTile: TileCoord = {
      x: Math.floor(current.x / tileSize),
      y: Math.floor(current.z / tileSize),
    };

    if (newTile.x !== lastTile.current.x || newTile.y !== lastTile.current.y) {
      lastTile.current = newTile;
      onMove(newTile, nextFacing);
    } else if (nextFacing !== facingRef.current) {
      facingRef.current = nextFacing;
      onMove(newTile, nextFacing);
    }
  });

  return (
    <SpriteBillboard
      sprite={sprite}
      position={{ x: worldPos.current.x, y: 0, z: worldPos.current.z }}
      rotationY={FACING_ANGLE[facing]}
      scale={1.1}
      label="You"
      labelColor={tokens.accent}
      portraitUri="/game-art/field-guide-v1.png"
    />
  );
}
