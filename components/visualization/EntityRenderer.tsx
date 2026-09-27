'use client';

import { useMemo } from 'react';
import type { PlacedEntity } from '@/world/schemas/world';
import { resolvePrimitive } from '@/world/registries/primitiveRegistry';
import { resolveAsset } from '@/world/registries/assetRegistry';
import {
  OfficeBuilding,
  OfficeTower,
  AgentControlCenter,
  DataCenter,
  Warehouse,
  DistributionCenter,
  Factory,
  Workshop,
  Airport,
  ControlTower,
  TargetApplication,
  Person,
  RequestEntity,
} from '@/scene-sdk';

/**
 * Entity renderer.
 *
 * Resolves `visual.primitive` through the primitive registry and renders the
 * matching SDK component. There is NO repository-specific branching here — the
 * registry is the only source of truth, so new concepts are added as data.
 */

const PRIMITIVE_COMPONENTS: Record<string, React.ComponentType<EntityComponentProps>> = {
  office_building: OfficeBuilding,
  office_tower: OfficeTower,
  agent_control_center: AgentControlCenter,
  data_center: DataCenter,
  warehouse: Warehouse,
  distribution_center: DistributionCenter,
  factory: Factory,
  workshop: Workshop,
  airport: Airport,
  control_tower: ControlTower,
  target_application: TargetApplication,
  person: Person,
  request_entity: RequestEntity,
};

interface EntityComponentProps {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  state?: 'idle' | 'active' | 'success' | 'failure' | 'highlighted';
  color?: string;
  metadata?: Record<string, unknown>;
  onSelect?: () => void;
}

export interface EntityRendererProps {
  entity: PlacedEntity;
  state?: EntityComponentProps['state'];
  accent?: string;
  onSelect?: (entityId: string) => void;
}

export function EntityRenderer({ entity, state, accent, onSelect }: EntityRendererProps) {
  const descriptor = useMemo(() => resolvePrimitive(entity.visual.primitive), [entity.visual.primitive]);

  // Asset resolution is a separate concern: procedural geometry is the default,
  // GLB is an optional layer. The renderer does not care which is chosen.
  const asset = useMemo(
    () => resolveAsset(entity.visual.asset, entity.visual.primitive),
    [entity.visual.asset, entity.visual.primitive],
  );

  const Component = PRIMITIVE_COMPONENTS[descriptor.id] ?? OfficeBuilding;

  const handleSelect = useMemo(
    () => (onSelect ? () => onSelect(entity.id) : undefined),
    [onSelect, entity.id],
  );

  // GLB assets are not part of the MVP; fall back to procedural geometry so the
  // scene always renders something meaningful.
  void asset;

  return (
    <Component
      position={entity.resolved_position}
      rotation={entity.resolved_rotation}
      scale={entity.resolved_scale}
      state={state}
      color={accent}
      metadata={entity.metadata}
      onSelect={handleSelect}
    />
  );
}