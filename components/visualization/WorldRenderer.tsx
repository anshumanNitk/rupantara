'use client';

import { useMemo } from 'react';
import type { PlacedWorld } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { EntityRenderer } from './EntityRenderer';
import { ConnectionRenderer } from './ConnectionRenderer';
import { ZoneRenderer } from './ZoneRenderer';
import { CameraController } from './CameraController';
import { RuntimeEventLayer } from './RuntimeEventLayer';
import type { VisualStyle } from './visualStyle';

/**
 * World renderer — the fixed, universal visualization runtime.
 *
 * It consumes a Placed World Specification and renders it. It contains no
 * repository-specific logic: swapping the world JSON produces a different city
 * without changing a single line here.
 */

export interface WorldRendererProps {
  world: PlacedWorld;
  style: VisualStyle;
  events: RuntimeEvent[];
  selectedEntityId: string | null;
  visibleZones: Set<string> | null;
  visibleTypes: Set<string> | null;
  resetSignal: number;
  onSelectEntity: (entityId: string | null) => void;
  onEventComplete?: (eventId: string) => void;
}

export function WorldRenderer({
  world,
  style,
  events,
  selectedEntityId,
  visibleZones,
  visibleTypes,
  resetSignal,
  onSelectEntity,
  onEventComplete,
}: WorldRendererProps) {
  const visibleEntities = useMemo(
    () =>
      world.entities.filter((entity) => {
        if (visibleZones && entity.zone !== null && !visibleZones.has(entity.zone)) return false;
        if (visibleTypes && !visibleTypes.has(entity.semantic_type)) return false;
        return true;
      }),
    [world.entities, visibleZones, visibleTypes],
  );

  const visibleEntityIds = useMemo(
    () => new Set(visibleEntities.map((e) => e.id)),
    [visibleEntities],
  );

  const visibleConnections = useMemo(
    () => world.connections.filter((c) => visibleEntityIds.has(c.from) && visibleEntityIds.has(c.to)),
    [world.connections, visibleEntityIds],
  );

  return (
    <>
      <color attach="background" args={[style.background]} />
      <fog attach="fog" args={[style.fog.color, style.fog.near, style.fog.far]} />

      <ambientLight intensity={style.ambient.intensity} color={style.ambient.color} />
      <directionalLight
        intensity={style.directional.intensity}
        color={style.directional.color}
        position={style.directional.position}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight intensity={0.25} groundColor={style.ground} />

      <CameraController world={world} style={style} resetSignal={resetSignal} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={style.ground} roughness={1} />
      </mesh>

      {style.showZones &&
        world.zones.map((zone) => (
          <ZoneRenderer key={zone.id} zone={zone} color={style.accent} opacity={style.zoneOpacity} />
        ))}

      {visibleConnections.map((connection) => (
        <ConnectionRenderer
          key={connection.id}
          connection={connection}
          color={style.connectionColor}
        />
      ))}

      {visibleEntities.map((entity) => (
        <EntityRenderer
          key={entity.id}
          entity={entity}
          state={selectedEntityId === entity.id ? 'highlighted' : 'idle'}
          accent={style.accent}
          onSelect={onSelectEntity}
        />
      ))}

      <RuntimeEventLayer world={world} events={events} onEventComplete={onEventComplete} />
    </>
  );
}