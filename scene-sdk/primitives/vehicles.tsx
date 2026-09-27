'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Vec3 } from '@/world/schemas/world';
import type { SceneEntityProps } from '../primitives/types';
import { stateColor } from '../primitives/types';

/**
 * Vehicle primitives.
 *
 * Vehicles are generic movers. When given a `path` and `animated`, they travel
 * along it using a deterministic arc-length parameterisation. The behavior
 * engine drives them; the vehicle itself knows nothing about the domain.
 */

export interface VehicleProps extends SceneEntityProps {
  path?: Vec3[];
  animated?: boolean;
  /** Milliseconds for one full traversal. */
  durationMs?: number;
  /** Loop the traversal instead of stopping at the end. */
  loop?: boolean;
}

function samplePath(path: Vec3[], t: number): { position: Vec3; heading: number } {
  if (path.length === 0) return { position: { x: 0, y: 0, z: 0 }, heading: 0 };
  if (path.length === 1) return { position: path[0]!, heading: 0 };

  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (path.length - 1);
  const index = Math.min(Math.floor(scaled), path.length - 2);
  const local = scaled - index;

  const a = path[index]!;
  const b = path[index + 1]!;

  return {
    position: {
      x: a.x + (b.x - a.x) * local,
      y: a.y + (b.y - a.y) * local,
      z: a.z + (b.z - a.z) * local,
    },
    heading: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

function useVehicleMotion(props: VehicleProps) {
  const ref = useRef<Group>(null);
  const path = props.path;
  const animated = props.animated ?? false;
  const durationMs = props.durationMs ?? 3000;
  const loop = props.loop ?? true;

  useFrame(({ clock }) => {
    if (!ref.current || !path || path.length < 2) return;

    const elapsedMs = clock.elapsedTime * 1000;
    const raw = elapsedMs / durationMs;
    const t = loop ? raw % 1 : Math.min(raw, 1);

    const { position, heading } = samplePath(path, t);
    ref.current.position.set(position.x, position.y + 0.6, position.z);
    ref.current.rotation.y = -heading;
  });

  return ref;
}

export function Car(props: VehicleProps) {
  const ref = useVehicleMotion(props);
  const color = stateColor(props.state, props.color ?? '#ef5b5b');
  const t = props.position ?? { x: 0, y: 0, z: 0 };

  return (
    <group ref={ref} position={[t.x, t.y + 0.6, t.z]} scale={props.scale ?? 1} onClick={props.onSelect}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.6, 0.6, 0.9]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[0.9, 0.5, 0.8]} />
        <meshStandardMaterial color="#9fd0ff" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

export function Truck(props: VehicleProps) {
  const ref = useVehicleMotion(props);
  const color = stateColor(props.state, props.color ?? '#5b8def');
  const t = props.position ?? { x: 0, y: 0, z: 0 };

  return (
    <group ref={ref} position={[t.x, t.y + 0.6, t.z]} scale={props.scale ?? 1} onClick={props.onSelect}>
      <mesh castShadow position={[-0.5, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0.7, 0.5, 0]}>
        <boxGeometry args={[1, 1, 0.95]} />
        <meshStandardMaterial color="#2b3445" />
      </mesh>
    </group>
  );
}

/** Robot worker — the default RPA-style mover. */
export function RobotWorker(props: VehicleProps) {
  const ref = useVehicleMotion(props);
  const color = stateColor(props.state, props.color ?? '#3ecf8e');
  const t = props.position ?? { x: 0, y: 0, z: 0 };

  return (
    <group ref={ref} position={[t.x, t.y + 0.6, t.z]} scale={props.scale ?? 1} onClick={props.onSelect}>
      <mesh castShadow position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.3, 0.6, 6, 12]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#9fd0ff" emissive="#9fd0ff" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export function Airplane(props: VehicleProps) {
  const ref = useVehicleMotion(props);
  const color = stateColor(props.state, props.color ?? '#e2e8f0');
  const t = props.position ?? { x: 0, y: 0, z: 0 };

  return (
    <group ref={ref} position={[t.x, t.y + 0.6, t.z]} scale={props.scale ?? 1} onClick={props.onSelect}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.22, 1.4, 6, 12]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.5, 0.08, 2.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[-0.7, 0.15, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function useVehiclePath(path: Vec3[] | undefined): Vec3[] | undefined {
  return useMemo(() => path, [path]);
}