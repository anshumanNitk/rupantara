import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { findCycleNodes, validateGamePack } from '@/game/compiler/validators';
import { breakPrerequisiteCycles } from '@/game/compiler/narrativeGameplayCompiler';
import { playtest } from '@/game/agent/playtest';

/**
 * Regression tests for "Game compilation produced an invalid pack: Quest cycle
 * detected involving m_forge / m_glass / m_replan / m_loop / m_finale".
 *
 * Two distinct bugs produced that message:
 *   1. The validator flagged every DIAMOND DAG as a cycle (false positive).
 *   2. A creative model sometimes writes a GENUINE loop, which must be repaired
 *      rather than shipped as a permanently-locked quest.
 */

const graph = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('Quest cycle detection', () => {
  it('does not flag a diamond DAG as a cycle', () => {
    // m_forge -> {m_glass, m_replan} -> m_finale is legal: m_finale is simply
    // reached by two different paths.
    const cycles = findCycleNodes(
      graph({
        m_forge: [],
        m_glass: ['m_forge'],
        m_replan: ['m_forge'],
        m_finale: ['m_glass', 'm_replan'],
      }),
    );
    expect([...cycles]).toEqual([]);
  });

  it('flags only the nodes that are really on a loop', () => {
    const cycles = findCycleNodes(
      graph({
        m_forge: [],
        m_glass: ['m_forge'],
        m_loop: ['m_finale'],
        m_finale: ['m_loop', 'm_glass'],
      }),
    );
    expect([...cycles].sort()).toEqual(['m_finale', 'm_loop']);
  });

  it('flags a self-loop', () => {
    expect([...findCycleNodes(graph({ m_loop: ['m_loop'] }))]).toEqual(['m_loop']);
  });
});

describe('Prerequisite cycle repair', () => {
  it('breaks a genuine loop and leaves the graph acyclic', () => {
    const repaired = breakPrerequisiteCycles([
      { id: 'm_forge', prerequisites: [] },
      { id: 'm_glass', prerequisites: ['m_forge'] },
      { id: 'm_replan', prerequisites: ['m_glass', 'm_finale'] },
      { id: 'm_loop', prerequisites: ['m_replan'] },
      { id: 'm_finale', prerequisites: ['m_loop'] },
    ]);
    const cycles = findCycleNodes(new Map(repaired.map((m) => [m.id, m.prerequisites])));
    expect([...cycles]).toEqual([]);
  });

  it('keeps every edge of a valid diamond', () => {
    const input = [
      { id: 'a', prerequisites: [] },
      { id: 'b', prerequisites: ['a'] },
      { id: 'c', prerequisites: ['a'] },
      { id: 'd', prerequisites: ['b', 'c'] },
    ];
    expect(breakPrerequisiteCycles(input)).toEqual(input);
  });

  it('turns a cyclic agent story into a valid, winnable pack', () => {
    const placed = buildWorld(RPA_ARCHITECTURE).placed;
    const authored = compileGamePack(placed).narrative!;
    const [first, second, third, ...rest] = authored.missions;
    expect(first && second && third).toBeTruthy();

    // Re-create the shape the agent produced: a diamond plus a genuine loop.
    const cyclic = {
      ...authored,
      missions: [
        { ...first!, prerequisites: [third!.id] },
        { ...second!, prerequisites: [first!.id] },
        { ...third!, prerequisites: [second!.id, first!.id] },
        ...rest,
      ],
    };

    const pack = compileGamePack(placed, { narrative: cyclic });
    expect(validateGamePack(pack)).toEqual([]);
    expect(playtest(pack).ok).toBe(true);
  });
});
