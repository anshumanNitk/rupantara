import { describe, expect, it } from 'vitest';
import { ArchitectureGraphSchema, validateArchitectureGraph } from '@/world/schemas/architecture';
import { WorldSpecificationSchema, validateWorldSpecification } from '@/world/schemas/world';
import { RuntimeEventSchema } from '@/world/schemas/runtimeEvent';
import { validate } from '@/world/schemas/validate';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { ECOMMERCE_ARCHITECTURE } from '@/fixtures/ecommerceArchitecture';

describe('Architecture Graph schema', () => {
  it('accepts the RPA fixture', () => {
    const result = validate(ArchitectureGraphSchema, RPA_ARCHITECTURE, validateArchitectureGraph);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts the e-commerce fixture', () => {
    const result = validate(ArchitectureGraphSchema, ECOMMERCE_ARCHITECTURE, validateArchitectureGraph);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects an edge pointing at a missing node', () => {
    const broken = {
      ...RPA_ARCHITECTURE,
      edges: [{ id: 'bad', source: 'rpa_agent', target: 'does_not_exist', type: 'dependency' }],
    };
    const result = validate(ArchitectureGraphSchema, broken, validateArchitectureGraph);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('does_not_exist');
  });

  it('rejects a node referencing an unknown group', () => {
    const broken = {
      ...RPA_ARCHITECTURE,
      nodes: [{ ...RPA_ARCHITECTURE.nodes[0]!, group: 'ghost' }],
      edges: [],
    };
    const result = validate(ArchitectureGraphSchema, broken, validateArchitectureGraph);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('ghost');
  });

  it('rejects a parent cycle', () => {
    const broken = {
      ...RPA_ARCHITECTURE,
      nodes: [
        { id: 'a', label: 'A', type: 'service', group: null, parent: 'b', metadata: {} },
        { id: 'b', label: 'B', type: 'service', group: null, parent: 'a', metadata: {} },
      ],
      edges: [],
    };
    const result = validate(ArchitectureGraphSchema, broken, validateArchitectureGraph);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('cycle');
  });

  it('rejects coordinates smuggled into the graph', () => {
    const broken = {
      ...RPA_ARCHITECTURE,
      nodes: [{ ...RPA_ARCHITECTURE.nodes[0]!, x: 1, y: 2, z: 3 }],
    };
    // The graph schema is strict: an LLM emitting raw coordinates must fail
    // validation loudly rather than have them silently stripped.
    const result = validate(ArchitectureGraphSchema, broken, validateArchitectureGraph);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unrecognized key/i);
  });

  /**
   * Regression: the Python service (Pydantic) serialises absent values as JSON
   * `null`, while hand-authored fixtures omit them. An earlier schema used
   * `.optional()` (undefined only), so Python-produced graphs passed Pydantic
   * validation and then failed in the browser with
   * "repository.branch: Expected string, received null".
   */
  it('accepts a Python-style graph with explicit nulls', () => {
    const pythonStyle = {
      schema_version: '1.0',
      repository: {
        name: 'rpa-agent',
        branch: null,
        provider: 'github',
        owner: 'anshumanNitk',
      },
      groups: [
        { id: 'core', label: 'Core', diagram_region: 'center', description: null },
      ],
      nodes: [
        {
          id: 'agent',
          label: 'Agent',
          type: 'agent',
          group: 'core',
          parent: null,
          metadata: {},
          spatial: {
            zone: null,
            anchor: null,
            relation: null,
            placement: null,
          },
          source: { file: null, symbol: null, line: null },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'agent',
          target: 'agent',
          type: 'dependency',
          label: null,
          metadata: {},
        },
      ],
    };

    const result = validate(ArchitectureGraphSchema, pythonStyle, validateArchitectureGraph);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts a node with source omitted entirely', () => {
    const withoutSource = {
      ...RPA_ARCHITECTURE,
      nodes: RPA_ARCHITECTURE.nodes.map((node) => {
        const { source: _omitted, ...rest } = node;
        return rest;
      }),
    };

    const result = validate(ArchitectureGraphSchema, withoutSource, validateArchitectureGraph);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('Runtime Event schema', () => {
  it('accepts a well-formed event', () => {
    const result = validate(RuntimeEventSchema, {
      id: 'e1',
      type: 'tool_called',
      timestamp: 1760000000000,
      source: 'rpa_agent',
      target: 'tool_runtime',
      metadata: { tool: 'browser_action' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const result = validate(RuntimeEventSchema, {
      id: 'e1',
      type: 'not_a_real_event',
      timestamp: 1,
      source: null,
      target: null,
    });
    expect(result.ok).toBe(false);
  });
});

describe('World Specification schema', () => {
  it('rejects a connection referencing a missing entity', () => {
    const result = validate(WorldSpecificationSchema, {
      schema_version: '1.0',
      world: { id: 'w', name: 'W', seed: 1, coordinate_system: 'x-right,y-depth,z-up' },
      zones: [],
      entities: [
        {
          id: 'a',
          semantic_type: 'agent',
          archetype: 'building',
          zone: null,
          spatial: { anchor: null, relation: null, placement: null },
          visual: { primitive: 'agent_control_center', asset: null },
          metadata: {},
        },
      ],
      connections: [
        {
          id: 'c1',
          from: 'a',
          to: 'missing',
          semantic_type: 'memory',
          visual: { archetype: 'road' },
          behavior: { vehicle: null, animation: null },
        },
      ],
    }, validateWorldSpecification);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('missing');
  });
});