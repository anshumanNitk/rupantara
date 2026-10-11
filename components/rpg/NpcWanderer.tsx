'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { GamePack } from '@/game/schemas/gamePack';
import type { Npc } from '@/game/schemas/npc';
import { isWalkable } from '@/game/schemas/tilemap';
import { resolveSprite } from '@/game/registries/spriteRegistry';
import { SpriteBillboard } from './SpriteBillboard';

/**
 * Visual-only patrol around an NPC's home tile.
 *
 * Interaction, pathfinding and playtests still use `npc.position`. The sprite
 * interpolates on walkable tiles inside `wander.radius` so the streets feel
 * lived-in without ever moving the compiled home tile.
 */

export interface NpcWandererProps {
  npc: Npc;
  pack: GamePack;
  highlighted: boolean;
  onSelect: (npcId: string) => void;
  portraitPrompt?: string | null;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function walkableRing(pack: GamePack, npc: Npc): Array<{ x: number; y: number }> {
  const radius = npc.wander?.radius ?? 0;
  const tiles: Array<{ x: number; y: number }> = [{ x: npc.position.x, y: npc.position.y }];
  if (radius <= 0) return tiles;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      const x = npc.position.x + dx;
      const y = npc.position.y + dy;
      if (isWalkable(pack.map, x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

export function NpcWanderer({ npc, pack, highlighted, onSelect, portraitPrompt }: NpcWandererProps) {
  const group = useRef<Group>(null);
  const tileSize = pack.map.tile_size;
  const waypoints = useMemo(() => walkableRing(pack, npc), [pack, npc]);
  const phase = useMemo(() => (hash32(npc.id) % 1000) / 1000, [npc.id]);
  const speed = npc.wander?.speed ?? 0;
  const home = {
    x: (npc.position.x + 0.5) * tileSize,
    y: 0,
    z: (npc.position.y + 0.5) * tileSize,
  };

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    if (!npc.wander || waypoints.length < 2 || speed <= 0) {
      node.position.set(home.x, home.y, home.z);
      return;
    }
    const t = clock.elapsedTime * speed * 0.35 + phase * waypoints.length;
    const index = Math.floor(t) % waypoints.length;
    const nextIndex = (index + 1) % waypoints.length;
    const frac = t - Math.floor(t);
    const from = waypoints[index]!;
    const to = waypoints[nextIndex]!;
    node.position.set(
      (from.x + (to.x - from.x) * frac + 0.5) * tileSize,
      0,
      (from.y + (to.y - from.y) * frac + 0.5) * tileSize,
    );
  });

  return (
    <group ref={group} position={[home.x, home.y, home.z]}>
      <SpriteBillboard
        sprite={resolveSprite(npc.sprite)}
        position={{ x: 0, y: 0, z: 0 }}
        label={highlighted || !npc.ambient ? npc.label : undefined}
        highlighted={highlighted}
        onClick={() => onSelect(npc.id)}
        portraitPrompt={portraitPrompt}
        theme={pack.theme.id}
      />
    </group>
  );
}
