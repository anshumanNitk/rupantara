'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Vec3 } from '@/world/schemas/world';

/**
 * Behavior primitives.
 *
 * The behavior engine resolves behavior names through BEHAVIOR_REGISTRY and
 * renders the matching component. Behaviors operate on generic paths and
 * entities — they never know what a "tool" or "memory" is.
 */

export interface BehaviorProps {
  /** Entity the behavior is applied to. */
  entityId: string;
  /** Routed path, required by path-following behaviors. */
  path?: Vec3[];
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Whether the behavior repeats. */
  loop?: boolean;
  /** Called when a non-looping behavior completes. */
  onComplete?: () => void;
  children?: React.ReactNode;
}

function samplePath(path: Vec3[], t: number): { position: Vec3; heading: number } {
  if (path.length < 2) {
    return { position: path[0] ?? { x: 0, y: 0, z: 0 }, heading: 0 };
  }
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

/** Moves its children along a routed path. */
export function MoveAlongPath({ path, durationMs = 1200, loop = true, onComplete, children }: BehaviorProps) {
  const ref = useRef<Group>(null);
  const done = useRef(false);

  useFrame(({ clock }) => {
    if (!ref.current || !path || path.length < 2) return;
    const raw = (clock.elapsedTime * 1000) / durationMs;
    const t = loop ? raw % 1 : Math.min(raw, 1);
    const { position, heading } = samplePath(path, t);
    ref.current.position.set(position.x, position.y, position.z);
    ref.current.rotation.y = -heading;

    if (!loop && t >= 1 && !done.current) {
      done.current = true;
      onComplete?.();
    }
  });

  return <group ref={ref}>{children}</group>;
}

/** Moves along an arc — same as path following, but keeps a banked heading. */
export function MoveAlongArc(props: BehaviorProps) {
  return <MoveAlongPath {...props} />;
}

/** Pulses its children's scale. */
export function Pulse({ durationMs = 700, children }: BehaviorProps) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = ((clock.elapsedTime * 1000) % durationMs) / durationMs;
    const s = 1 + Math.sin(t * Math.PI * 2) * 0.12;
    ref.current.scale.setScalar(s);
  });

  return <group ref={ref}>{children}</group>;
}

/** Scales children in from zero. */
export function Spawn({ durationMs = 800, children }: BehaviorProps) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = Math.min((clock.elapsedTime * 1000) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    ref.current.scale.setScalar(eased);
  });

  return <group ref={ref}>{children}</group>;
}

/** Fades children out and removes them. */
export function Exit({ durationMs = 900, onComplete, children }: BehaviorProps) {
  const ref = useRef<Group>(null);
  const done = useRef(false);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = Math.min((clock.elapsedTime * 1000) / durationMs, 1);
    ref.current.scale.setScalar(1 - t);
    if (t >= 1 && !done.current) {
      done.current = true;
      onComplete?.();
    }
  });

  return <group ref={ref}>{children}</group>;
}

/** Fades children in. */
export function Enter({ durationMs = 900, children }: BehaviorProps) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = Math.min((clock.elapsedTime * 1000) / durationMs, 1);
    ref.current.scale.setScalar(t);
  });

  return <group ref={ref}>{children}</group>;
}

/** Continuously rotates children around the Y axis. */
export function Orbit({ durationMs = 4000, children }: BehaviorProps) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = ((clock.elapsedTime * 1000) / durationMs) * Math.PI * 2;
  });

  return <group ref={ref}>{children}</group>;
}