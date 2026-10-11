'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import type { TileMap } from '@/game/schemas/tilemap';
import type { Theme } from '@/game/schemas/theme';
import { terrainColor, terrainHeight } from './rpgGeometry';

/**
 * Tile map renderer.
 *
 * Batches terrain into one instanced mesh per terrain type. This keeps large
 * repositories cheap to draw without any repository-specific logic: the map is
 * pure data and the renderer only knows terrain ids.
 *
 * District floors are drawn per-district so each town quarter has its own
 * colour, and decorations (trees, rocks) are drawn as simple low-poly props.
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
    // District floors are keyed by district id so each quarter gets its colour.
    const districtAt = new Map<string, string>();
    for (const district of map.districts) {
      for (let y = district.min.y; y <= district.max.y; y += 1) {
        for (let x = district.min.x; x <= district.max.x; x += 1) {
          districtAt.set(`${x},${y}`, district.id);
        }
      }
    }

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const terrain = map.terrain[y * map.width + x] ?? 'grass';
        const districtId = terrain === 'floor' ? districtAt.get(`${x},${y}`) : undefined;
        const key = districtId ? `floor:${districtId}` : terrain;
        let batch = byTerrain.get(key);
        if (!batch) {
          const district = districtId ? map.districts.find((d) => d.id === districtId) : undefined;
          batch = {
            terrain: key,
            color: district ? district.color : terrainColor(terrain, theme),
            cells: [],
          };
          byTerrain.set(key, batch);
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
      {map.districts.map((district) => (
        <Text
          key={`label_${district.id}`}
          position={[
            ((district.min.x + district.max.x) / 2 + 0.5) * map.tile_size,
            0.6,
            (district.min.y - 0.6) * map.tile_size,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.9}
          color={theme.palette.accent}
          outlineWidth={0.03}
          outlineColor="#0b0f16"
          anchorX="center"
          anchorY="middle"
        >
          {district.label}
        </Text>
      ))}
      {map.decorations.map((decoration, index) => (
        <Decoration
          key={`${decoration.kind}_${decoration.position.x}_${decoration.position.y}_${index}`}
          kind={decoration.kind}
          x={decoration.position.x}
          y={decoration.position.y}
          tileSize={map.tile_size}
          theme={theme}
        />
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

/** A low-poly decorative prop. Never blocks movement. */
function Decoration({
  kind,
  x,
  y,
  tileSize,
  theme,
}: {
  kind: 'tree' | 'rock' | 'bush';
  x: number;
  y: number;
  tileSize: number;
  theme: Theme;
}) {
  const position: [number, number, number] = [(x + 0.5) * tileSize, 0, (y + 0.5) * tileSize];

  if (kind === 'rock') {
    return (
      <mesh position={[position[0], 0.25, position[2]]} castShadow>
        <dodecahedronGeometry args={[tileSize * 0.28, 0]} />
        <meshStandardMaterial color={theme.palette.cliff} roughness={1} flatShading />
      </mesh>
    );
  }

  if (kind === 'bush') {
    return (
      <mesh position={[position[0], 0.3, position[2]]} castShadow>
        <sphereGeometry args={[tileSize * 0.3, 8, 6]} />
        <meshStandardMaterial color={theme.palette.ground} roughness={1} flatShading />
      </mesh>
    );
  }

  // Tree: trunk + two stacked cones.
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[tileSize * 0.08, tileSize * 0.1, 1, 6]} />
        <meshStandardMaterial color="#6b4f2a" roughness={1} />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <coneGeometry args={[tileSize * 0.42, 1.2, 7]} />
        <meshStandardMaterial color="#3f7d3a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 2.0, 0]} castShadow>
        <coneGeometry args={[tileSize * 0.3, 0.9, 7]} />
        <meshStandardMaterial color="#4a8f43" roughness={1} flatShading />
      </mesh>
    </group>
  );
}
