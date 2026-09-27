import { z } from 'zod';

/**
 * Runtime Event — activity layered on top of the static architecture world.
 *
 * Static world = architecture. Runtime events = what the system is doing.
 * The behavior engine consumes these without knowing what any entity means.
 */

export const RUNTIME_EVENT_TYPES = [
  'task_received',
  'memory_lookup',
  'memory_hit',
  'memory_miss',
  'procedure_replayed',
  'planning_started',
  'tool_called',
  'observation_received',
  'data_read',
  'data_written',
  'task_succeeded',
  'task_failed',
  'procedure_learned',
] as const;

export const RuntimeEventTypeSchema = z.enum(RUNTIME_EVENT_TYPES);
export type RuntimeEventType = z.infer<typeof RuntimeEventTypeSchema>;

export const RuntimeEventSchema = z.object({
  id: z.string().min(1),
  type: RuntimeEventTypeSchema,
  timestamp: z.number().int().nonnegative(),
  source: z.string().nullable(),
  target: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
});
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const RuntimeEventBatchSchema = z.object({
  world_id: z.string().min(1),
  events: z.array(RuntimeEventSchema),
});
export type RuntimeEventBatch = z.infer<typeof RuntimeEventBatchSchema>;

/**
 * Maps an event type to a generic behavior. This is data, not branching logic —
 * the behavior engine looks up the descriptor and applies it.
 */
export interface EventBehaviorDescriptor {
  /** Entity that emits the visual (usually the event source). */
  emitter: 'source' | 'target' | 'both';
  /** Generic behavior primitive name, resolved via BEHAVIOR_REGISTRY. */
  behavior: string;
  /** Optional vehicle primitive used when the behavior travels a path. */
  vehicle?: string;
  /** Optional effect primitive triggered at the destination. */
  effect?: string;
  /** Relative duration hint in milliseconds. */
  durationMs: number;
}

export const EVENT_BEHAVIOR_MAP: Record<RuntimeEventType, EventBehaviorDescriptor> = {
  task_received: { emitter: 'target', behavior: 'spawn', durationMs: 800 },
  memory_lookup: { emitter: 'source', behavior: 'follow_path', vehicle: 'robot_worker', durationMs: 1200 },
  memory_hit: { emitter: 'target', behavior: 'pulse', effect: 'success', durationMs: 600 },
  memory_miss: { emitter: 'target', behavior: 'pulse', effect: 'failure', durationMs: 600 },
  procedure_replayed: { emitter: 'source', behavior: 'follow_path', vehicle: 'robot_worker', durationMs: 900 },
  planning_started: { emitter: 'source', behavior: 'pulse', durationMs: 700 },
  tool_called: { emitter: 'source', behavior: 'follow_path', vehicle: 'robot_worker', durationMs: 1400 },
  observation_received: { emitter: 'target', behavior: 'follow_path', vehicle: 'robot_worker', durationMs: 1000 },
  data_read: { emitter: 'source', behavior: 'follow_path', vehicle: 'truck', durationMs: 1200 },
  data_written: { emitter: 'source', behavior: 'follow_path', vehicle: 'truck', durationMs: 1200 },
  task_succeeded: { emitter: 'target', behavior: 'pulse', effect: 'success', durationMs: 900 },
  task_failed: { emitter: 'target', behavior: 'pulse', effect: 'failure', durationMs: 900 },
  procedure_learned: { emitter: 'source', behavior: 'follow_path', vehicle: 'robot_worker', durationMs: 1500 },
};