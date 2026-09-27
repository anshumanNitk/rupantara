/**
 * Behavior registry — generic behavior primitives.
 *
 * The behavior engine resolves behavior names through this registry. It never
 * needs to know what an entity means; it only knows how to move, pulse, spawn
 * or destroy things along paths.
 */

export interface BehaviorDescriptor {
  id: string;
  label: string;
  /** Whether this behavior requires a routed path to operate on. */
  requiresPath: boolean;
  /** Default duration in milliseconds. */
  defaultDurationMs: number;
}

export const BEHAVIOR_REGISTRY: Record<string, BehaviorDescriptor> = {
  move: { id: 'move', label: 'Move', requiresPath: false, defaultDurationMs: 1000 },
  rotate: { id: 'rotate', label: 'Rotate', requiresPath: false, defaultDurationMs: 1000 },
  scale: { id: 'scale', label: 'Scale', requiresPath: false, defaultDurationMs: 600 },
  fade: { id: 'fade', label: 'Fade', requiresPath: false, defaultDurationMs: 600 },
  pulse: { id: 'pulse', label: 'Pulse', requiresPath: false, defaultDurationMs: 700 },
  spawn: { id: 'spawn', label: 'Spawn', requiresPath: false, defaultDurationMs: 800 },
  destroy: { id: 'destroy', label: 'Destroy', requiresPath: false, defaultDurationMs: 600 },
  follow_path: { id: 'follow_path', label: 'Follow Path', requiresPath: true, defaultDurationMs: 1200 },
  follow_arc: { id: 'follow_arc', label: 'Follow Arc', requiresPath: true, defaultDurationMs: 1400 },
  move_along_path: { id: 'move_along_path', label: 'Move Along Path', requiresPath: true, defaultDurationMs: 1200 },
  move_along_arc: { id: 'move_along_arc', label: 'Move Along Arc', requiresPath: true, defaultDurationMs: 1400 },
  enter: { id: 'enter', label: 'Enter', requiresPath: true, defaultDurationMs: 900 },
  exit: { id: 'exit', label: 'Exit', requiresPath: true, defaultDurationMs: 900 },
  highlight: { id: 'highlight', label: 'Highlight', requiresPath: false, defaultDurationMs: 800 },
  orbit: { id: 'orbit', label: 'Orbit', requiresPath: false, defaultDurationMs: 4000 },
};

export function resolveBehavior(id: string): BehaviorDescriptor | null {
  return BEHAVIOR_REGISTRY[id] ?? null;
}