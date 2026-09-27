'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import type { PlacedWorld } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { WorldRenderer } from './WorldRenderer';
import type { VisualStyle } from './visualStyle';

/**
 * World canvas — the R3F host.
 *
 * Deliberately thin: it owns the WebGL context and hands everything else to
 * WorldRenderer. This is the boundary between "rendering is runtime" and the
 * rest of the system.
 */

export interface WorldCanvasProps {
  world: PlacedWorld;
  style: VisualStyle;
  events?: RuntimeEvent[];
  selectedEntityId?: string | null;
  visibleZones?: Set<string> | null;
  visibleTypes?: Set<string> | null;
  resetSignal?: number;
  onSelectEntity?: (entityId: string | null) => void;
  onEventComplete?: (eventId: string) => void;
}

export function WorldCanvas({
  world,
  style,
  events = [],
  selectedEntityId = null,
  visibleZones = null,
  visibleTypes = null,
  resetSignal = 0,
  onSelectEntity = () => {},
  onEventComplete,
}: WorldCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 2000, position: [60, 60, 60] }}
      onPointerMissed={() => onSelectEntity(null)}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <WorldRenderer
          world={world}
          style={style}
          events={events}
          selectedEntityId={selectedEntityId}
          visibleZones={visibleZones}
          visibleTypes={visibleTypes}
          resetSignal={resetSignal}
          onSelectEntity={onSelectEntity}
          onEventComplete={onEventComplete}
        />
      </Suspense>
    </Canvas>
  );
}