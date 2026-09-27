'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { Vec3 } from '@/world/schemas/world';
import type { SceneConnectionProps } from '../primitives/types';

/**
 * Connection primitives — roads, bridges, air routes, pipes, beams, data routes.
 *
 * All of them consume a routed path produced by the layout engine. They differ
 * only in how that path is rendered, never in what it means.
 */

function toPoints(path: Vec3[]): [number, number, number][] {
  return path.map((p) => [p.x, p.y, p.z]);
}

/** Road — a flat ribbon laid on the ground plane. */
export function Road({ path, color = '#3a4658', width = 1.6, opacity = 1, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width * 3}
      transparent
      opacity={opacity}
      onClick={onSelect}
    />
  );
}

/** Bridge — an elevated ribbon with support pylons. */
export function Bridge({ path, color = '#8a5a3b', width = 1.4, opacity = 1, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  const pylons = useMemo(
    () => path.filter((_, index) => index > 0 && index < path.length - 1),
    [path],
  );

  return (
    <group onClick={onSelect}>
      <Line points={points} color={color} lineWidth={width * 3} transparent opacity={opacity} />
      {pylons.map((p, index) => (
        <mesh key={index} position={[p.x, p.z / 2, p.y]}>
          <boxGeometry args={[0.3, Math.max(p.z, 0.4), 0.3]} />
          <meshStandardMaterial color="#5a4632" />
        </mesh>
      ))}
    </group>
  );
}

/** Air route — a dashed arc through the sky. */
export function AirRoute({ path, color = '#9fd0ff', width = 1, opacity = 0.7, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width * 2}
      dashed
      dashSize={1.2}
      gapSize={0.8}
      transparent
      opacity={opacity}
      onClick={onSelect}
    />
  );
}

/** Pipe — a thick tube following the path. */
export function Pipe({ path, color = '#6b7280', width = 0.35, opacity = 1, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  return (
    <Line points={points} color={color} lineWidth={width * 8} transparent opacity={opacity} onClick={onSelect} />
  );
}

/** Beam — a glowing straight-line signal. */
export function Beam({ path, color = '#f5c451', width = 0.6, opacity = 0.85, animated = true, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current || !animated) return;
    const pulse = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.4;
    ref.current.scale.setScalar(pulse);
  });

  return (
    <group onClick={onSelect}>
      <Line points={points} color={color} lineWidth={width * 3} transparent opacity={opacity} />
      <mesh ref={ref} position={points[0]}>
        <sphereGeometry args={[0.25, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

/** Data route — a road with a travelling packet marker. */
export function DataRoute({ path, color = '#3ecf8e', width = 1.2, opacity = 0.9, animated = true, onSelect }: SceneConnectionProps) {
  const points = useMemo(() => toPoints(path), [path]);
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current || !animated || path.length < 2) return;
    const t = (clock.elapsedTime * 0.5) % 1;
    const scaled = t * (path.length - 1);
    const index = Math.min(Math.floor(scaled), path.length - 2);
    const local = scaled - index;
    const a = path[index]!;
    const b = path[index + 1]!;
    ref.current.position.set(
      a.x + (b.x - a.x) * local,
      a.y + (b.y - a.y) * local + 0.4,
      a.z + (b.z - a.z) * local,
    );
  });

  return (
    <group onClick={onSelect}>
      <Line points={points} color={color} lineWidth={width * 3} transparent opacity={opacity} />
      <mesh ref={ref} position={points[0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}