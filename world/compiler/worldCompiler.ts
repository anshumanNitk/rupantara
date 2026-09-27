import type { z } from 'zod';
import type { ArchitectureGraph, ArchitectureNode } from '../schemas/architecture';
import { ArchitectureGraphSchema, validateArchitectureGraph } from '../schemas/architecture';
import type { WorldSpecification, WorldEntity, WorldConnection, WorldZone } from '../schemas/world';
import { resolveEntityMapping, resolveConnectionMapping } from '../registries/semanticRegistry';
import { validateOrThrow } from '../schemas/validate';

/**
 * World Compiler — Architecture Graph -> World Specification.
 *
 * Pure, deterministic, side-effect free. Same graph in, same world out.
 * It decides HOW architecture is represented spatially (zones, archetypes,
 * primitives) but never WHERE exactly — that is the layout engine's job.
 */

export interface CompileOptions {
  /** Overrides the derived seed. Useful for tests and reproducible demos. */
  seed?: number;
  /** Optional world id override. */
  worldId?: string;
  /** Optional world name override. */
  worldName?: string;
}

/**
 * Derives a stable 32-bit seed from a string. Deterministic across runs and
 * platforms (FNV-1a), so the same repository always yields the same world.
 */
export function deriveSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Groups become zones. A node whose group is null is assigned to a synthetic
 * "ungrouped" zone so every entity has a spatial home.
 */
function compileZones(graph: ArchitectureGraph): WorldZone[] {
  const zones: WorldZone[] = graph.groups.map((group) => ({
    id: group.id,
    label: group.label,
    spatial_hint: { region: group.diagram_region },
  }));

  const hasUngrouped = graph.nodes.some((node) => node.group === null);
  if (hasUngrouped) {
    zones.push({
      id: 'ungrouped',
      label: 'Ungrouped',
      spatial_hint: { region: 'center' },
    });
  }

  return zones;
}

function compileEntity(node: ArchitectureNode): WorldEntity {
  const mapping = resolveEntityMapping(node.type);

  return {
    id: node.id,
    semantic_type: node.type,
    archetype: mapping.archetype,
    zone: node.group ?? 'ungrouped',
    spatial: {
      anchor: node.spatial?.anchor ?? node.parent ?? null,
      relation: node.spatial?.relation ?? (node.parent !== null ? 'containment' : null),
      placement:
        node.spatial?.placement ??
        (node.parent !== null ? 'near_parent' : node.group === null ? 'center' : 'adjacent'),
    },
    visual: {
      primitive: mapping.primitive,
      asset: mapping.asset ?? null,
    },
    metadata: node.metadata,
    provenance: {
      architecture_node_id: node.id,
      ...(node.source ? { source: node.source } : {}),
    },
  };
}

function compileConnection(
  edge: ArchitectureGraph['edges'][number],
): WorldConnection {
  const mapping = resolveConnectionMapping(edge.type);

  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    semantic_type: edge.type,
    visual: { archetype: mapping.archetype },
    behavior: { vehicle: mapping.vehicle, animation: mapping.animation },
    provenance: { architecture_edge_id: edge.id },
  };
}

/**
 * Compiles an Architecture Graph into a World Specification.
 *
 * Accepts raw input and validates it first, so callers can pass AI output
 * directly. Malformed graphs are rejected here rather than producing a
 * half-built world.
 */
export function compileWorld(
  graphInput: z.input<typeof ArchitectureGraphSchema>,
  options: CompileOptions = {},
): WorldSpecification {
  const graph = validateOrThrow(
    ArchitectureGraphSchema,
    graphInput,
    validateArchitectureGraph,
    'Architecture Graph',
  );

  const seed =
    options.seed ??
    deriveSeed(`${graph.repository.name}:${graph.repository.branch ?? 'main'}`);

  const worldId = options.worldId ?? (slugify(graph.repository.name) || 'world');
  const worldName = options.worldName ?? graph.repository.name;

  return {
    schema_version: '1.0',
    world: {
      id: worldId,
      name: worldName,
      seed,
      coordinate_system: 'x-right,y-depth,z-up',
    },
    zones: compileZones(graph),
    entities: graph.nodes.map(compileEntity),
    connections: graph.edges.map(compileConnection),
    behaviors: [],
    asset_registry: [],
  };
}