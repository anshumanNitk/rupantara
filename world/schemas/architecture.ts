import { z } from 'zod';

/**
 * Architecture Graph — the stable contract produced by Architecture Intelligence.
 *
 * This is the ONLY thing the visualization system knows about a repository.
 * It contains no coordinates. Spatial meaning is expressed semantically via
 * `diagram_region` (groups) and `spatial` hints (nodes).
 */

export const DIAGRAM_REGIONS = [
  'center',
  'north',
  'south',
  'east',
  'west',
  'north_east',
  'north_west',
  'south_east',
  'south_west',
  'far_east',
  'far_west',
  'far_north',
  'far_south',
] as const;

export const DiagramRegionSchema = z.enum(DIAGRAM_REGIONS);
export type DiagramRegion = z.infer<typeof DiagramRegionSchema>;

/**
 * Semantic node types. These are intentionally generic architecture concepts,
 * not technologies. A `database` node may be Redis, Postgres or DynamoDB —
 * the visualization layer never needs to know which.
 */
export const NODE_TYPES = [
  'agent',
  'service',
  'frontend',
  'backend',
  'database',
  'cache',
  'queue',
  'broker',
  'storage',
  'object_storage',
  'external_service',
  'tool',
  'compute',
  'user',
  'task',
  'gateway',
  'scheduler',
  'monitor',
  'unknown',
] as const;

export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const EDGE_TYPES = [
  'dependency',
  'data_flow',
  'control_flow',
  'memory',
  'api_call',
  'event',
  'sync',
  'async',
  'ownership',
  'unknown',
] as const;

export const EdgeTypeSchema = z.enum(EDGE_TYPES);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Semantic placement hint. The AI may express WHERE something belongs
 * relative to the diagram, but must never emit raw x/y/z coordinates.
 */
export const SpatialHintSchema = z.object({
  zone: z.string().optional(),
  anchor: z.string().nullable().optional(),
  relation: z.enum(['dependency', 'containment', 'sibling', 'flow']).nullable().optional(),
  placement: z
    .enum(['center', 'near_parent', 'inside_parent', 'adjacent', 'orbit'])
    .nullable()
    .optional(),
});
export type SpatialHint = z.infer<typeof SpatialHintSchema>;

export const ArchitectureGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  diagram_region: DiagramRegionSchema,
  description: z.string().optional(),
});
export type ArchitectureGroup = z.infer<typeof ArchitectureGroupSchema>;

export const ArchitectureNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: NodeTypeSchema,
  group: z.string().nullable(),
  parent: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  spatial: SpatialHintSchema.optional(),
  /** Provenance back to the repository. Preserved verbatim from the analyzer. */
  source: z
    .object({
      file: z.string().optional(),
      symbol: z.string().optional(),
      line: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ArchitectureNode = z.infer<typeof ArchitectureNodeSchema>;

export const ArchitectureEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: EdgeTypeSchema,
  label: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type ArchitectureEdge = z.infer<typeof ArchitectureEdgeSchema>;

export const ArchitectureGraphSchema = z.object({
  schema_version: z.literal('1.0'),
  repository: z.object({
    name: z.string().min(1),
    branch: z.string().optional(),
    provider: z.string().optional(),
    owner: z.string().optional(),
  }),
  groups: z.array(ArchitectureGroupSchema).default([]),
  nodes: z.array(ArchitectureNodeSchema).min(1),
  edges: z.array(ArchitectureEdgeSchema).default([]),
});
export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;

/**
 * Structural validation beyond what zod can express:
 * referential integrity between nodes, groups and edges.
 */
export function validateArchitectureGraph(graph: ArchitectureGraph): string[] {
  const errors: string[] = [];
  const groupIds = new Set(graph.groups.map((g) => g.id));
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  }

  for (const node of graph.nodes) {
    if (node.group !== null && !groupIds.has(node.group)) {
      errors.push(`Node "${node.id}" references unknown group "${node.group}"`);
    }
    if (node.parent !== null && !nodeIds.has(node.parent)) {
      errors.push(`Node "${node.id}" references unknown parent "${node.parent}"`);
    }
    if (node.parent === node.id) {
      errors.push(`Node "${node.id}" is its own parent`);
    }
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge "${edge.id}" has unknown source "${edge.source}"`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge "${edge.id}" has unknown target "${edge.target}"`);
    }
  }

  // Detect parent cycles.
  const parentOf = new Map(graph.nodes.map((n) => [n.id, n.parent]));
  for (const node of graph.nodes) {
    const seen = new Set<string>([node.id]);
    let cursor = parentOf.get(node.id) ?? null;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        errors.push(`Parent cycle detected involving node "${node.id}"`);
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  return errors;
}