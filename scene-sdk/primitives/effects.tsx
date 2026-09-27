'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import type { Vec3 } from '@/world/schemas/world';

/**
 * Effect and label primitives.
 *
 * Effects are transient visual feedback driven by runtime events. Labels are
 * always camera-facing so the world stays readable from any angle.
 */

export interface EffectProps {
  position: Vec3;
  color?: string;
  /** Milliseconds for one pulse cycle. */
  durationMs?: number;
  scale?: number;
}

/** Expanding ring — used for success/failure feedback. */
export function PulseEffect({ position, color = '#3ecf8e', durationMs = 900, scale = 1 }: EffectProps) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime * 1000) % durationMs / durationMs;
    const s = (0.4 + t * 2.2) * scale;
    ref.current.scale.set(s, s, s);
    const material = ref.current.material as { opacity?: number };
    if (typeof material.opacity === 'number') {
      material.opacity = 1 - t;
    }
  });

  return (
    <mesh ref={ref} position={[position.x, position.y + 0.2, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} side={2} />
    </mesh>
  );
}

export function SuccessEffect(props: EffectProps) {
  return <PulseEffect {...props} color={props.color ?? '#3ecf8e'} />;
}

export function FailureEffect(props: EffectProps) {
  return <PulseEffect {...props} color={props.color ?? '#ef5b5b'} />;
}

/** Rising particle column — generic ambient activity. */
export function ParticleEffect({ position, color = '#9fd0ff', scale = 1 }: EffectProps) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.children.forEach((child, index) => {
      const offset = index * 0.4;
      child.position.y = ((clock.elapsedTime + offset) % 3) * 1.2;
      const material = (child as Mesh).material as { opacity?: number };
      if (typeof material.opacity === 'number') {
        material.opacity = 1 - ((clock.elapsedTime + offset) % 3) / 3;
      }
    });
  });

  return (
    <group ref={ref} position={[position.x, position.y, position.z]} scale={scale}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[(i - 2) * 0.3, 0, 0]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export interface LabelProps {
  position: Vec3;
  text: string;
  color?: string;
  size?: number;
  /** Vertical offset above the anchor point. */
  offsetY?: number;
}

/** Camera-facing text label. */
export function Label({ position, text, color = '#e2e8f0', size = 0.6, offsetY = 2 }: LabelProps) {
  return (
    <Billboard position={[position.x, position.y + offsetY, position.z]}>
      <Text
        fontSize={size}
        color={color}
        outlineWidth={0.02}
        outlineColor="#0b0f16"
        anchorX="center"
        anchorY="middle"
      >
        {text}
      </Text>
    </Billboard>
  );
}