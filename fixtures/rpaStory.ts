import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';

/**
 * Fixture: the RPA procedure-memory story.
 *
 * First task misses memory and must plan. Second task hits memory and replays
 * the learned procedure, so it looks visibly more direct.
 */

const T0 = 1760000000000;

export const RPA_STORY_EVENTS: RuntimeEvent[] = [
  // --- First task: MISS -> plan -> tools -> observe -> learn ---
  { id: 'evt_1', type: 'task_received', timestamp: T0, source: 'task_intake', target: 'rpa_agent', metadata: { task: 'invoice-001' } },
  { id: 'evt_2', type: 'memory_lookup', timestamp: T0 + 500, source: 'rpa_agent', target: 'redis', metadata: {} },
  { id: 'evt_3', type: 'memory_miss', timestamp: T0 + 1500, source: 'redis', target: 'rpa_agent', metadata: {} },
  { id: 'evt_4', type: 'planning_started', timestamp: T0 + 2000, source: 'rpa_agent', target: 'planner', metadata: {} },
  { id: 'evt_5', type: 'tool_called', timestamp: T0 + 3000, source: 'planner', target: 'tool_runtime', metadata: { tool: 'browser_action' } },
  { id: 'evt_6', type: 'tool_called', timestamp: T0 + 4200, source: 'tool_runtime', target: 'browser_tool', metadata: { tool: 'browser_action' } },
  { id: 'evt_7', type: 'tool_called', timestamp: T0 + 5400, source: 'browser_tool', target: 'target_app', metadata: { action: 'fill_form' } },
  { id: 'evt_8', type: 'observation_received', timestamp: T0 + 6800, source: 'target_app', target: 'rpa_agent', metadata: { result: 'ok' } },
  { id: 'evt_9', type: 'task_succeeded', timestamp: T0 + 7800, source: 'rpa_agent', target: 'task_intake', metadata: {} },
  { id: 'evt_10', type: 'procedure_learned', timestamp: T0 + 8400, source: 'rpa_agent', target: 'procedure_store', metadata: { steps: 6 } },

  // --- Second task: HIT -> replay (visibly shorter) ---
  { id: 'evt_11', type: 'task_received', timestamp: T0 + 12000, source: 'task_intake', target: 'rpa_agent', metadata: { task: 'invoice-002' } },
  { id: 'evt_12', type: 'memory_lookup', timestamp: T0 + 12500, source: 'rpa_agent', target: 'redis', metadata: {} },
  { id: 'evt_13', type: 'memory_hit', timestamp: T0 + 13500, source: 'redis', target: 'rpa_agent', metadata: {} },
  { id: 'evt_14', type: 'procedure_replayed', timestamp: T0 + 14000, source: 'rpa_agent', target: 'tool_runtime', metadata: { steps: 6 } },
  { id: 'evt_15', type: 'tool_called', timestamp: T0 + 15200, source: 'tool_runtime', target: 'target_app', metadata: { action: 'replay' } },
  { id: 'evt_16', type: 'task_succeeded', timestamp: T0 + 16600, source: 'rpa_agent', target: 'task_intake', metadata: {} },
];