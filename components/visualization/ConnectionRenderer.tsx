'use client';

import { useMemo } from 'react';
import type { PlacedConnection } from '@/world/schemas/world';
import { Road, Bridge, AirRoute, Pipe, Beam, DataRoute } from '@/scene-sdk';

/**
 * Connection renderer.
 *
 * Resolves `visual.archetype` through a registry. Adding a new connection
 * archetype means adding one entry here plus one SDK primitive — the core
 * renderer never changes.
 */

interface ConnectionComponentProps {
  path: { x: number; y: number; z: number }[];
  color?: string;
  animated?: boolean;
  onSelect?: () => void;
}

const CONNECTION_COMPONENTS: Record<string, React.ComponentType<ConnectionComponentProps>> = {
  road: Road,
  bridge: Bridge,
  air_route: AirRoute,
  pipe: Pipe,
  beam: Beam,
  data_route: DataRoute,
};

export interface ConnectionRendererProps {
  connection: PlacedConnection;
  color?: string;
  onSelect?: (connectionId: string) => void;
}

export function ConnectionRenderer({ connection, color, onSelect }: ConnectionRendererProps) {
  const Component = CONNECTION_COMPONENTS[connection.visual.archetype] ?? Road;

  const handleSelect = useMemo(
    () => (onSelect ? () => onSelect(connection.id) : undefined),
    [onSelect, connection.id],
  );

  return (
    <Component
      path={connection.path}
      color={color}
      animated={connection.behavior.animation !== null}
      onSelect={handleSelect}
    />
  );
}