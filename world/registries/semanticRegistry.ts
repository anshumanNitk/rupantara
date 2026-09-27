import type { NodeType, EdgeType } from '../schemas/architecture';
import type { EntityArchetype, ConnectionArchetype } from '../schemas/world';

/**
 * Semantic -> Visual mapping.
 *
 * These are GENERIC architecture concepts, never repository technologies.
 * Adding a new concept means adding a registry entry, not editing the renderer.
 *
 * Correct:   database -> building / data_center
 * Incorrect: postgres -> renderPostgres()
 */

export interface EntitySemanticMapping {
  archetype: EntityArchetype;
  primitive: string;
  /** Optional default asset id resolved through the asset registry. */
  asset?: string;
}

export const ENTITY_SEMANTIC_REGISTRY: Record<NodeType, EntitySemanticMapping> = {
  agent: { archetype: 'building', primitive: 'agent_control_center' },
  service: { archetype: 'building', primitive: 'office_building' },
  frontend: { archetype: 'building', primitive: 'office_building' },
  backend: { archetype: 'building', primitive: 'office_tower' },
  database: { archetype: 'building', primitive: 'data_center' },
  cache: { archetype: 'building', primitive: 'data_center' },
  queue: { archetype: 'building', primitive: 'distribution_center' },
  broker: { archetype: 'building', primitive: 'distribution_center' },
  storage: { archetype: 'building', primitive: 'warehouse' },
  object_storage: { archetype: 'building', primitive: 'warehouse' },
  external_service: { archetype: 'building', primitive: 'airport' },
  tool: { archetype: 'building', primitive: 'workshop' },
  compute: { archetype: 'building', primitive: 'factory' },
  user: { archetype: 'person', primitive: 'person' },
  task: { archetype: 'person', primitive: 'request_entity' },
  gateway: { archetype: 'building', primitive: 'control_tower' },
  scheduler: { archetype: 'building', primitive: 'control_tower' },
  monitor: { archetype: 'building', primitive: 'control_tower' },
  unknown: { archetype: 'building', primitive: 'office_building' },
};

export interface ConnectionSemanticMapping {
  archetype: ConnectionArchetype;
  vehicle: string | null;
  animation: string | null;
}

export const CONNECTION_SEMANTIC_REGISTRY: Record<EdgeType, ConnectionSemanticMapping> = {
  dependency: { archetype: 'road', vehicle: 'car', animation: 'move_along_path' },
  data_flow: { archetype: 'data_route', vehicle: 'truck', animation: 'move_along_path' },
  control_flow: { archetype: 'beam', vehicle: null, animation: 'pulse' },
  memory: { archetype: 'road', vehicle: 'robot_worker', animation: 'move_along_path' },
  api_call: { archetype: 'air_route', vehicle: 'airplane', animation: 'move_along_arc' },
  event: { archetype: 'beam', vehicle: null, animation: 'pulse' },
  sync: { archetype: 'road', vehicle: 'car', animation: 'move_along_path' },
  async: { archetype: 'pipe', vehicle: 'truck', animation: 'move_along_path' },
  ownership: { archetype: 'bridge', vehicle: null, animation: null },
  unknown: { archetype: 'road', vehicle: null, animation: null },
};

export function resolveEntityMapping(type: NodeType): EntitySemanticMapping {
  return ENTITY_SEMANTIC_REGISTRY[type] ?? ENTITY_SEMANTIC_REGISTRY.unknown;
}

export function resolveConnectionMapping(type: EdgeType): ConnectionSemanticMapping {
  return CONNECTION_SEMANTIC_REGISTRY[type] ?? CONNECTION_SEMANTIC_REGISTRY.unknown;
}