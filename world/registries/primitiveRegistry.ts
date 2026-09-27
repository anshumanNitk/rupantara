import type { EntityArchetype, ConnectionArchetype } from '../schemas/world';

/**
 * Primitive registry — the set of visual primitives the Scene SDK exposes.
 *
 * The renderer resolves `visual.primitive` through this registry. Unknown
 * primitives fall back to a safe default rather than crashing the scene.
 */

export interface PrimitiveDescriptor {
  id: string;
  archetype: EntityArchetype | ConnectionArchetype;
  /** Footprint used by the layout engine for collision + spacing. */
  footprint: { x: number; y: number };
  /** Default height, used for camera framing and label anchoring. */
  height: number;
  label: string;
}

export const PRIMITIVE_REGISTRY: Record<string, PrimitiveDescriptor> = {
  // --- Buildings ---
  office_building: { id: 'office_building', archetype: 'building', footprint: { x: 4, y: 4 }, height: 6, label: 'Office Building' },
  office_tower: { id: 'office_tower', archetype: 'building', footprint: { x: 4, y: 4 }, height: 12, label: 'Office Tower' },
  agent_control_center: { id: 'agent_control_center', archetype: 'building', footprint: { x: 6, y: 6 }, height: 8, label: 'Agent Control Center' },
  data_center: { id: 'data_center', archetype: 'building', footprint: { x: 6, y: 5 }, height: 4, label: 'Data Center' },
  warehouse: { id: 'warehouse', archetype: 'building', footprint: { x: 7, y: 5 }, height: 4, label: 'Warehouse' },
  distribution_center: { id: 'distribution_center', archetype: 'building', footprint: { x: 6, y: 6 }, height: 5, label: 'Distribution Center' },
  factory: { id: 'factory', archetype: 'building', footprint: { x: 8, y: 6 }, height: 5, label: 'Factory' },
  workshop: { id: 'workshop', archetype: 'building', footprint: { x: 5, y: 5 }, height: 4, label: 'Workshop' },
  airport: { id: 'airport', archetype: 'building', footprint: { x: 10, y: 8 }, height: 3, label: 'Airport' },
  control_tower: { id: 'control_tower', archetype: 'building', footprint: { x: 3, y: 3 }, height: 14, label: 'Control Tower' },
  target_application: { id: 'target_application', archetype: 'building', footprint: { x: 9, y: 7 }, height: 6, label: 'Target Application' },

  // --- People / moving entities ---
  person: { id: 'person', archetype: 'person', footprint: { x: 1, y: 1 }, height: 2, label: 'Person' },
  request_entity: { id: 'request_entity', archetype: 'person', footprint: { x: 1, y: 1 }, height: 2, label: 'Request' },

  // --- Vehicles ---
  car: { id: 'car', archetype: 'vehicle', footprint: { x: 1, y: 1 }, height: 1, label: 'Car' },
  truck: { id: 'truck', archetype: 'vehicle', footprint: { x: 1, y: 1 }, height: 1.5, label: 'Truck' },
  robot_worker: { id: 'robot_worker', archetype: 'vehicle', footprint: { x: 1, y: 1 }, height: 1.5, label: 'Robot Worker' },
  airplane: { id: 'airplane', archetype: 'vehicle', footprint: { x: 1, y: 1 }, height: 1, label: 'Airplane' },

  // --- Effects ---
  success_effect: { id: 'success_effect', archetype: 'effect', footprint: { x: 1, y: 1 }, height: 1, label: 'Success' },
  failure_effect: { id: 'failure_effect', archetype: 'effect', footprint: { x: 1, y: 1 }, height: 1, label: 'Failure' },
  particle_effect: { id: 'particle_effect', archetype: 'effect', footprint: { x: 1, y: 1 }, height: 1, label: 'Particles' },

  // --- Connections ---
  road: { id: 'road', archetype: 'road', footprint: { x: 1, y: 1 }, height: 0.2, label: 'Road' },
  bridge: { id: 'bridge', archetype: 'bridge', footprint: { x: 1, y: 1 }, height: 0.4, label: 'Bridge' },
  air_route: { id: 'air_route', archetype: 'air_route', footprint: { x: 1, y: 1 }, height: 0.1, label: 'Air Route' },
  pipe: { id: 'pipe', archetype: 'pipe', footprint: { x: 1, y: 1 }, height: 0.3, label: 'Pipe' },
  beam: { id: 'beam', archetype: 'beam', footprint: { x: 1, y: 1 }, height: 0.1, label: 'Beam' },
  data_route: { id: 'data_route', archetype: 'data_route', footprint: { x: 1, y: 1 }, height: 0.2, label: 'Data Route' },
};

export const FALLBACK_PRIMITIVE: PrimitiveDescriptor = {
  id: 'office_building',
  archetype: 'building',
  footprint: { x: 4, y: 4 },
  height: 5,
  label: 'Structure',
};

export function resolvePrimitive(id: string): PrimitiveDescriptor {
  return PRIMITIVE_REGISTRY[id] ?? FALLBACK_PRIMITIVE;
}

export function primitiveFootprint(id: string): { x: number; y: number } {
  return resolvePrimitive(id).footprint;
}