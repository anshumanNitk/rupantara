'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { TileMap } from '@/game/schemas/tilemap';
import type { Theme } from '@/game/schemas/theme';
import { terrainColor, terrainHeight } from './rpgGeometry';

/**
 * Tile map renderer.
 *
 * Batches terrain into one instanced mesh per terrain type. This keeps large
 * repositories cheap to draw without any repository-specific logic: the map is
 * pure data and the renderer only knows terrain ids.
 */

export interface TileMapRendererProps {
  map: TileMap;
  theme: Theme;
}

interface TerrainBatch {
  terrain: string;
  color: string;
  cells: Array<{ x: number; y: number; height: number }>;
}

export function TileMapRenderer({ map, theme }: TileMapRendererProps) {
  const batches = useMemo<TerrainBatch[]>(() => {
    const byTerrain = new Map<string, TerrainBatch>();
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const terrain = map.terrain[y * map.width + x] ?? 'grass';
        let batch = byTerrain.get(terrain);
        if (!batch) {
          batch = { terrain, color: terrainColor(terrain, theme), cells: [] };
          byTerrain.set(terrain, batch);
        }
        batch.cells.push({ x, y, height: terrainHeight(terrain) });
      }
    }
    return [...byTerrain.values()].sort((a, b) => a.terrain.localeCompare(b.terrain));
  }, [map, theme]);

  return (
    <group>
      {batches.map((batch) => (
        <TerrainInstances key={batch.terrain} batch={batch} tileSize={map.tile_size} />
      ))}
    </group>
  );
}

function TerrainInstances({ batch, tileSize }: { batch: TerrainBatch; tileSize: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    batch.cells.forEach((cell, index) => {
      matrix.makeTranslation(
        (cell.x + 0.5) * tileSize,
        cell.height,
        (cell.y + 0.5) * tileSize,
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch, tileSize]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, batch.cells.length]}
      receiveShadow
      castShadow={false}
    >
      <boxGeometry args={[tileSize, 0.4, tileSize]} />
      <meshStandardMaterial color={batch.color} roughness={0.95} />
    </instancedMesh>
  );
}
