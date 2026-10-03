'use client';

import type { LandmarkArchetype } from '@/game/schemas/landmark';

/**
 * Procedural landmark archetypes.
 *
 * Each archetype is a generic RPG location silhouette. The renderer resolves a
 * landmark's archetype through this registry, so adding a new location type is
 * a data change, never a renderer branch. All meshes are low-poly and share a
 * narrow palette supplied by the theme.
 */

export interface LandmarkMeshProps {
  color: string;
  accent: string;
  /** Footprint in world units. */
  width: number;
  depth: number;
  highlighted?: boolean;
}

type LandmarkMesh = (props: LandmarkMeshProps) => JSX.Element;

function GuildHall({ color, accent, width, depth, highlighted }: LandmarkMeshProps) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[width * 0.9, 3.2, depth * 0.9]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 3.6, 0]}>
        <coneGeometry args={[Math.max(width, depth) * 0.62, 2.2, 4]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.9, 0]}>
        <sphereGeometry args={[0.35, 12, 10]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={highlighted ? 1.2 : 0.5} />
      </mesh>
    </group>
  );
}

function Tower({ color, accent, width, depth, highlighted }: LandmarkMeshProps) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 2.4, 0]}>
        <cylinderGeometry args={[width * 0.42, width * 0.5, 4.8, 8]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 5.4, 0]}>
        <coneGeometry args={[width * 0.5, 1.8, 8]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      <mesh position={[0, 6.6, 0]}>
        <sphereGeometry args={[0.28, 10, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={highlighted ? 1.2 : 0.4} />
      </mesh>
    </group>
  );
}

function Archive({ color, accent, width, depth, highlighted }: LandmarkMeshProps) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.4, 0]}>
        <boxGeometry args={[width * 0.95, 2.8, depth * 0.95]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Shelves */}
      {[-0.6, 0, 0.6].map((offset) => (
        <mesh key={offset} position={[0, 1.4, offset * depth * 0.5]}>
          <boxGeometry args={[width * 0.8, 0.12, 0.2]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={highlighted ? 0.8 : 0.25} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 3.1, 0]}>
        <boxGeometry args={[width * 1.0, 0.4, depth * 1.0]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Forge({ color, accent, width, depth, highlighted }: LandmarkMeshProps) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.2, 0]}>
        <boxGeometry args={[width * 0.85, 2.4, depth * 0.85]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[width * 0.3, 3.2, -depth * 0.2]}>
        <cylinderGeometry args={[0.3, 0.4, 2.2, 8]} />
        <meshStandardMaterial color="#5a5148" />
      </mesh>
      <mesh position={[0, 1.0, depth * 0.45]}>
        <boxGeometry args={[width * 0.4, 0.8, 0.2]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={highlighted ? 1.4 : 0.7} />
      </mesh>
    </group>
  );
}

function Portal({ color, accent, width, depth, highlighted }: LandmarkMeshProps) {
  const radius = Math.max(width, depth) * 0.45;
  return (
    <group>
      <mesh castShadow position={[-radius, 1.6, 0]}>
        <boxGeometry args={[0.4, 3.2, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[radius, 1.6, 0]}>
        <boxGeometry args={[0.4, 3.2, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 3.4, 0]}>
        <boxGeometry args={[radius * 2 + 0.4, 0.4, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <planeGeometry args={[radius * 1.8, 3.0]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={highlighted ? 1.6 : 0.9}
          transparent
          opacity={0.55}
          side={2}
        />
      </mesh>
    </group>
  );
}

function Camp({ color, accent, width, depth }: LandmarkMeshProps) {
  return (
    <group>
      <mesh castShadow position={[0, 0.9, 0]}>
        <coneGeometry args={[Math.max(width, depth) * 0.5, 1.8, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[Math.max(width, depth) * 0.55, Math.max(width, depth) * 0.55, 0.1, 12]} />
        <meshStandardMaterial color={accent} />
      </mesh>
    </group>
  );
}

export const LANDMARK_MESHES: Record<LandmarkArchetype, LandmarkMesh> = {
  guild_hall: GuildHall,
  command_tower: Tower,
  observatory: Tower,
  town_hall: GuildHall,
  workshop: Forge,
  tower: Tower,
  archive: Archive,
  memory_vault: Archive,
  storehouse: Archive,
  dispatch_depot: Forge,
  courier_station: Camp,
  forge: Forge,
  laboratory: GuildHall,
  portal: Portal,
  realm_gate: Portal,
  camp: Camp,
};

export function resolveLandmarkMesh(archetype: LandmarkArchetype): LandmarkMesh {
  return LANDMARK_MESHES[archetype] ?? GuildHall;
}
