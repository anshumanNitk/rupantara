'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlacedWorld, Vec3 } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { EVENT_BEHAVIOR_MAP } from '@/world/schemas/runtimeEvent';
import { MoveAlongPath, RobotWorker, Car, Truck, Airplane, SuccessEffect, FailureEffect } from '@/scene-sdk';

/**
 * Runtime event layer.
 *
 * Consumes runtime events and animates the city. It resolves the event's
 * generic behavior descriptor and plays it along the routed connection between
 * source and target. It never interprets what the event means.
 */

export interface RuntimeEventLayerProps {
  world: PlacedWorld;
  events: RuntimeEvent[];
  /** Called when an event's animation finishes so it can be retired. */
  onEventComplete?: (eventId: string) => void;
}

interface ActiveAnimation {
  event: RuntimeEvent;
  path: Vec3[];
  durationMs: number;
  vehicle: string | null;
  effect: string | null;
}

const VEHICLE_COMPONENTS: Record<string, React.ComponentType<{ position: Vec3; scale?: number }>> = {
  robot_worker: RobotWorker,
  car: Car,
  truck: Truck,
  airplane: Airplane,
};

function findPath(world: PlacedWorld, source: string | null, target: string | null): Vec3[] | null {
  if (source === null || target === null) return null;

  const direct = world.connections.find((c) => c.from === source && c.to === target);
  if (direct) return direct.path;

  const reverse = world.connections.find((c) => c.from === target && c.to === source);
  if (reverse) return [...reverse.path].reverse();

  // No declared connection: synthesise a straight route so the event is still
  // visible rather than silently dropped.
  const from = world.entities.find((e) => e.id === source);
  const to = world.entities.find((e) => e.id === target);
  if (!from || !to) return null;

  return [from.resolved_position, to.resolved_position];
}

export function RuntimeEventLayer({ world, events, onEventComplete }: RuntimeEventLayerProps) {
  const [active, setActive] = useState<ActiveAnimation[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const incoming = events.filter((event) => !seen.current.has(event.id));
    if (incoming.length === 0) return;

    const next: ActiveAnimation[] = [];
    for (const event of incoming) {
      seen.current.add(event.id);
      const descriptor = EVENT_BEHAVIOR_MAP[event.type];
      const path = findPath(world, event.source, event.target);
      if (!path) continue;

      next.push({
        event,
        path,
        durationMs: descriptor.durationMs,
        vehicle: descriptor.vehicle ?? null,
        effect: descriptor.effect ?? null,
      });
    }

    if (next.length > 0) {
      setActive((current) => [...current, ...next]);
    }
  }, [events, world]);

  const rendered = useMemo(() => active, [active]);

  return (
    <group>
      {rendered.map((animation) => {
        const Vehicle = animation.vehicle ? VEHICLE_COMPONENTS[animation.vehicle] : null;
        const start = animation.path[0]!;

        return (
          <group key={animation.event.id}>
            {Vehicle ? (
              <MoveAlongPath
                entityId={animation.event.id}
                path={animation.path}
                durationMs={animation.durationMs}
                loop={false}
                onComplete={() => {
                  setActive((current) => current.filter((a) => a.event.id !== animation.event.id));
                  onEventComplete?.(animation.event.id);
                }}
              >
                <Vehicle position={{ x: 0, y: 0, z: 0 }} />
              </MoveAlongPath>
            ) : (
              <MoveAlongPath
                entityId={animation.event.id}
                path={animation.path}
                durationMs={animation.durationMs}
                loop={false}
                onComplete={() => {
                  setActive((current) => current.filter((a) => a.event.id !== animation.event.id));
                  onEventComplete?.(animation.event.id);
                }}
              >
                <mesh>
                  <sphereGeometry args={[0.3, 12, 10]} />
                  <meshStandardMaterial color="#f5c451" emissive="#f5c451" emissiveIntensity={0.7} />
                </mesh>
              </MoveAlongPath>
            )}

            {animation.effect === 'success' && <SuccessEffect position={start} />}
            {animation.effect === 'failure' && <FailureEffect position={start} />}
          </group>
        );
      })}
    </group>
  );
}