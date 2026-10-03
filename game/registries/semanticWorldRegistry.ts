import type { NodeType, EdgeType } from '@/world/schemas/architecture';
import type { LandmarkArchetype } from '../schemas/landmark';
import type { NpcRole } from '../schemas/npc';

/**
 * Semantic -> RPG mapping.
 *
 * This is the game-domain counterpart of `world/registries/semanticRegistry`.
 * It maps GENERIC architecture concepts to RPG roles. It must never special
 * case a technology such as Redis or Postgres — a `database` becomes an
 * `archive` whether it is Redis, Postgres or DynamoDB.
 */

export interface LandmarkRoleMapping {
  archetype: LandmarkArchetype;
  /** Footprint in tiles. */
  footprint: { w: number; h: number };
  /** Whether this concept is a good candidate for the guide NPC. */
  hub: boolean;
}

export const LANDMARK_ROLE_REGISTRY: Record<NodeType, LandmarkRoleMapping> = {
  agent: { archetype: 'guild_hall', footprint: { w: 4, h: 4 }, hub: true },
  scheduler: { archetype: 'command_tower', footprint: { w: 3, h: 3 }, hub: false },
  monitor: { archetype: 'observatory', footprint: { w: 3, h: 3 }, hub: false },
  service: { archetype: 'town_hall', footprint: { w: 4, h: 3 }, hub: false },
  frontend: { archetype: 'town_hall', footprint: { w: 4, h: 3 }, hub: false },
  backend: { archetype: 'tower', footprint: { w: 3, h: 3 }, hub: false },
  database: { archetype: 'archive', footprint: { w: 4, h: 3 }, hub: false },
  cache: { archetype: 'memory_vault', footprint: { w: 3, h: 3 }, hub: false },
  storage: { archetype: 'storehouse', footprint: { w: 4, h: 3 }, hub: false },
  object_storage: { archetype: 'storehouse', footprint: { w: 4, h: 3 }, hub: false },
  queue: { archetype: 'dispatch_depot', footprint: { w: 4, h: 3 }, hub: false },
  broker: { archetype: 'courier_station', footprint: { w: 3, h: 3 }, hub: false },
  tool: { archetype: 'forge', footprint: { w: 3, h: 3 }, hub: false },
  compute: { archetype: 'laboratory', footprint: { w: 4, h: 4 }, hub: false },
  external_service: { archetype: 'portal', footprint: { w: 3, h: 3 }, hub: false },
  gateway: { archetype: 'realm_gate', footprint: { w: 3, h: 3 }, hub: false },
  user: { archetype: 'camp', footprint: { w: 2, h: 2 }, hub: false },
  task: { archetype: 'camp', footprint: { w: 2, h: 2 }, hub: false },
  unknown: { archetype: 'town_hall', footprint: { w: 3, h: 3 }, hub: false },
};

export function resolveLandmarkRole(type: string): LandmarkRoleMapping {
  return LANDMARK_ROLE_REGISTRY[type as NodeType] ?? LANDMARK_ROLE_REGISTRY.unknown;
}

/** Node types that become NPCs rather than landmarks. */
export const NPC_NODE_TYPES: ReadonlySet<NodeType> = new Set(['user', 'task']);

export const NPC_ROLE_BY_NODE: Partial<Record<NodeType, NpcRole>> = {
  user: 'wanderer',
  task: 'courier',
};

export function resolveNpcRole(type: string): NpcRole {
  return NPC_ROLE_BY_NODE[type as NodeType] ?? 'wanderer';
}

/**
 * Edge -> gameplay effect. Edges become paths and, later, diegetic activity.
 * Kept generic and theme-independent.
 */
export interface EdgeGameplayMapping {
  /** Whether the edge carves a walkable path between its endpoints. */
  carvesPath: boolean;
  /** Optional runtime-event effect hint for the replay adapter. */
  effect: 'courier' | 'conduit' | 'portal' | 'signal' | 'none';
}

export const EDGE_GAMEPLAY_REGISTRY: Record<EdgeType, EdgeGameplayMapping> = {
  dependency: { carvesPath: true, effect: 'conduit' },
  data_flow: { carvesPath: true, effect: 'courier' },
  control_flow: { carvesPath: true, effect: 'signal' },
  memory: { carvesPath: true, effect: 'courier' },
  api_call: { carvesPath: false, effect: 'portal' },
  event: { carvesPath: false, effect: 'signal' },
  sync: { carvesPath: true, effect: 'conduit' },
  async: { carvesPath: true, effect: 'courier' },
  ownership: { carvesPath: false, effect: 'none' },
  unknown: { carvesPath: false, effect: 'none' },
};

export function resolveEdgeGameplay(type: string): EdgeGameplayMapping {
  return EDGE_GAMEPLAY_REGISTRY[type as EdgeType] ?? EDGE_GAMEPLAY_REGISTRY.unknown;
}
