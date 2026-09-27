import type { z } from 'zod';
import { ArchitectureGraphSchema } from '@/world/schemas/architecture';

/**
 * Fixture: RPA procedure-memory repository.
 *
 * Hand-authored Architecture Graph used to prove the pipeline before any AI is
 * involved. It is deliberately technology-flavoured in `metadata` only — the
 * semantic types stay generic.
 *
 * Typed as schema INPUT so fields with defaults (e.g. `metadata`) are optional
 * for hand-authored fixtures.
 */
export const RPA_ARCHITECTURE: z.input<typeof ArchitectureGraphSchema> = {
  schema_version: '1.0',
  repository: {
    name: 'rpa-agent',
    branch: 'procedure',
    provider: 'github',
    owner: 'anshumanNitk',
  },
  groups: [
    { id: 'human', label: 'Human / Task Intake', diagram_region: 'west' },
    { id: 'agent', label: 'Agent Control', diagram_region: 'center' },
    { id: 'memory', label: 'Procedure Memory', diagram_region: 'north' },
    { id: 'execution', label: 'Tool / Workflow Execution', diagram_region: 'east' },
    { id: 'environment', label: 'Target Application', diagram_region: 'far_east' },
  ],
  nodes: [
    {
      id: 'task_intake',
      label: 'Task Intake',
      type: 'user',
      group: 'human',
      parent: null,
      metadata: { channel: 'web' },
      source: { file: 'src/intake/task.ts', symbol: 'TaskIntake' },
    },
    {
      id: 'rpa_agent',
      label: 'RPA Agent',
      type: 'agent',
      group: 'agent',
      parent: null,
      metadata: { framework: 'LangGraph' },
      source: { file: 'src/agent/graph.ts', symbol: 'buildAgentGraph' },
    },
    {
      id: 'planner',
      label: 'Planner',
      type: 'service',
      group: 'agent',
      parent: 'rpa_agent',
      metadata: { strategy: 'react' },
      source: { file: 'src/agent/planner.ts', symbol: 'plan' },
    },
    {
      id: 'redis',
      label: 'Redis',
      type: 'database',
      group: 'memory',
      parent: null,
      metadata: { technology: 'Redis' },
      source: { file: 'src/memory/redis.ts', symbol: 'RedisStore' },
    },
    {
      id: 'procedure_store',
      label: 'Procedure Store',
      type: 'storage',
      group: 'memory',
      parent: 'redis',
      metadata: { format: 'json' },
      source: { file: 'src/memory/procedures.ts', symbol: 'ProcedureStore' },
    },
    {
      id: 'tool_runtime',
      label: 'Tool Runtime',
      type: 'tool',
      group: 'execution',
      parent: null,
      metadata: { sandboxed: true },
      source: { file: 'src/tools/runtime.ts', symbol: 'ToolRuntime' },
    },
    {
      id: 'browser_tool',
      label: 'Browser Tool',
      type: 'tool',
      group: 'execution',
      parent: 'tool_runtime',
      metadata: { driver: 'playwright' },
      source: { file: 'src/tools/browser.ts', symbol: 'BrowserTool' },
    },
    {
      id: 'target_app',
      label: 'Target Application',
      type: 'external_service',
      group: 'environment',
      parent: null,
      metadata: { kind: 'web-app' },
      source: { file: 'src/env/target.ts', symbol: 'TargetApp' },
    },
  ],
  edges: [
    { id: 'edge_1', source: 'task_intake', target: 'rpa_agent', type: 'control_flow', label: 'submits task' },
    { id: 'edge_2', source: 'rpa_agent', target: 'redis', type: 'memory', label: 'reads/writes' },
    { id: 'edge_3', source: 'rpa_agent', target: 'planner', type: 'dependency', label: 'delegates' },
    { id: 'edge_4', source: 'planner', target: 'tool_runtime', type: 'control_flow', label: 'invokes' },
    { id: 'edge_5', source: 'tool_runtime', target: 'browser_tool', type: 'dependency', label: 'loads' },
    { id: 'edge_6', source: 'browser_tool', target: 'target_app', type: 'api_call', label: 'drives UI' },
    { id: 'edge_7', source: 'target_app', target: 'rpa_agent', type: 'data_flow', label: 'observation' },
    { id: 'edge_8', source: 'redis', target: 'procedure_store', type: 'data_flow', label: 'persists' },
  ],
};