'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { SceneEntityProps } from '../primitives/types';
import { stateColor, DEFAULT_ACCENT } from '../primitives/types';

/**
 * People and moving entities.
 *
 * `Person` is a static inhabitant; `RequestEntity` is a task/request that
 * travels the world. Both are generic — they carry no repository meaning.
 */

function useTransform(props: SceneEntityProps) {
  return {
    position: props.position ?? { x: 0, y: 0, z: 0 },
    rotation: props.rotation ?? { x: 0, y: 0, z: 0 },
    scale: props.scale ?? 1,
  };
}

export function Person(props: SceneEntityProps) {
  const color = stateColor(props.state, props.color ?? '#e8b98a');
  const t = useTransform(props);
  return (
    <group position={[t.position.x, t.position.y, t.position.z]} rotation={[t.rotation.x, t.rotation.y, t.rotation.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.35, 16, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.75, 0]}>
        <capsuleGeometry args={[0.28, 0.7, 6, 12]} />
        <meshStandardMaterial color={props.color ?? '#4a5568'} />
      </mesh>
    </group>
  );
}

/** A task/request entity — a floating marker that bobs gently. */
export function RequestEntity(props: SceneEntityProps) {
  const ref = useRef<Group>(null);
  const color = stateColor(props.state, props.color ?? '#f5c451');
  const t = useTransform(props);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = t.position.y + 1.6 + Math.sin(clock.elapsedTime * 2) * 0.25;
    ref.current.rotation.y = clock.elapsedTime * 0.8;
  });

  return (
    <group ref={ref} position={[t.position.x, t.position.y + 1.6, t.position.z]} scale={t.scale} onClick={props.onSelect}>
      <mesh castShadow>
        <octahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

export const DEFAULT_PERSON_COLOR = DEFAULT_ACCENT;