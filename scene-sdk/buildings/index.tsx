'use client';

import { useMemo } from 'react';
import type { SceneEntityProps } from '../primitives/types';
import { DEFAULT_ACCENT, stateColor } from '../primitives/types';

/**
 * Procedural building primitives.
 *
 * Each primitive is a generic architectural concept (data center, warehouse,
 * airport) — never a repository technology. They all accept the same props so
 * the renderer can resolve them through PRIMITIVE_REGISTRY.
 */

type BuildingProps = SceneEntityProps & { accent?: string };

function useAccent(props: BuildingProps): string {
  return useMemo(
    () => stateColor(props.state, props.color ?? props.accent ?? DEFAULT_ACCENT),
    [props.state, props.color, props.accent],
  );
}

function useTransform(props: SceneEntityProps) {
  return {
    position: props.position ?? { x: 0, y: 0, z: 0 },
    rotation: props.rotation ?? { x: 0, y: 0, z: 0 },
    scale: props.scale ?? 1,
  };
}

/** Generic low-rise office block. */
export function OfficeBuilding(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 3, 0]}>
        <boxGeometry args={[4, 6, 4]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <boxGeometry args={[4.4, 0.4, 4.4]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
    </group>
  );
}

/** Tall office tower with a stepped silhouette. */
export function OfficeTower(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 6, 0]}>
        <boxGeometry args={[4, 12, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 13, 0]}>
        <boxGeometry args={[2.4, 2, 2.4]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
      <mesh position={[0, 14.4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.6, 6]} />
        <meshStandardMaterial color="#8b98ad" />
      </mesh>
    </group>
  );
}

/** Agent control center — a domed hub with a rotating beacon ring. */
export function AgentControlCenter(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2, 0]}>
        <cylinderGeometry args={[3.2, 3.6, 4, 24]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 4.6, 0]}>
        <sphereGeometry args={[2.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#9fd0ff" transparent opacity={0.75} roughness={0.2} />
      </mesh>
      <mesh position={[0, 7.4, 0]}>
        <torusGeometry args={[1.1, 0.12, 8, 24]} />
        <meshStandardMaterial color="#f5c451" emissive="#f5c451" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** Data center — a wide slab with server rows on the roof. */
export function DataCenter(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  const rows = [-1.6, 0, 1.6];
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2, 0]}>
        <boxGeometry args={[6, 4, 5]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {rows.map((y) => (
        <mesh key={y} position={[0, 4.3, y]}>
          <boxGeometry args={[5.2, 0.5, 0.7]} />
          <meshStandardMaterial color="#1f2733" emissive="#3ecf8e" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Warehouse — long low shed with a loading canopy. */
export function Warehouse(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2, 0]}>
        <boxGeometry args={[7, 4, 5]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 4.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2.5, 2.5, 7, 3, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#3a4658" />
      </mesh>
    </group>
  );
}

/** Distribution center — warehouse with dock bays. */
export function DistributionCenter(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  const bays = [-2, 0, 2];
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
        <boxGeometry args={[6, 5, 6]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {bays.map((x) => (
        <mesh key={x} position={[x, 1.2, 3.1]}>
          <boxGeometry args={[1.4, 2.4, 0.3]} />
          <meshStandardMaterial color="#1f2733" />
        </mesh>
      ))}
    </group>
  );
}

/** Factory — sawtooth roof with chimneys. */
export function Factory(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  const teeth = [-2.4, 0, 2.4];
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
        <boxGeometry args={[8, 5, 6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {teeth.map((x) => (
        <mesh key={x} position={[x, 5.4, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[2.2, 2.2, 6]} />
          <meshStandardMaterial color="#4a5568" />
        </mesh>
      ))}
      <mesh position={[3, 7.5, -2]}>
        <cylinderGeometry args={[0.5, 0.6, 5, 12]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
    </group>
  );
}

/** Workshop — small gabled tool shed. */
export function Workshop(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 2, 0]}>
        <boxGeometry args={[5, 4, 5]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 4.6, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[3.6, 3.6, 5]} />
        <meshStandardMaterial color="#8a5a3b" />
      </mesh>
    </group>
  );
}

/** Airport — terminal plus runway strip. */
export function Airport(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[10, 3, 4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh receiveShadow position={[0, 0.05, 5]}>
        <boxGeometry args={[14, 0.1, 2.4]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 1.2, 16]} />
        <meshStandardMaterial color="#9fd0ff" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** Control tower — tall narrow tower with a glazed cab. */
export function ControlTower(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 6, 0]}>
        <cylinderGeometry args={[0.9, 1.4, 12, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 12.6, 0]}>
        <cylinderGeometry args={[2, 2, 1.6, 16]} />
        <meshStandardMaterial color="#9fd0ff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 13.8, 0]}>
        <coneGeometry args={[2.2, 1.2, 16]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
    </group>
  );
}

/** Target application — the external system being automated. */
export function TargetApplication(props: BuildingProps) {
  const color = useAccent(props);
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow receiveShadow position={[0, 3, 0]}>
        <boxGeometry args={[9, 6, 7]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 6.4, 0]}>
        <boxGeometry args={[9.6, 0.5, 7.6]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
      <mesh position={[0, 4, 3.6]}>
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial color="#9fd0ff" emissive="#5b8def" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}