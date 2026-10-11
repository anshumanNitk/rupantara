import type { GamePack } from '../schemas/gamePack';
import type { TileCoord } from '../schemas/common';
import { isWalkable } from '../schemas/tilemap';
import { astar } from '../compiler/grid';
import { createInitialGameState, reduceGameState, type GameAction } from '../runtime/gameState';

/**
 * Headless playtest bot.
 *
 * Plays a pack through the REAL runtime (movement, collision, interactions,
 * dialogue, quest engine) and reports whether every quest can be completed.
 *
 * This turns "the pack validates" into "the pack is WINNABLE". It is the
 * strongest quality gate in the pipeline: schema validation proves structure,
 * the playtest proves playability.
 *
 * The bot is deterministic: it walks to objectives in a fixed order using A*.
 */

export interface PlaytestResult {
  ok: boolean;
  steps: number;
  log: string[];
  stuck?: string;
  quests: Record<string, 'locked' | 'active' | 'completed'>;
}

const MAX_STEPS = 200_000;

function manhattan(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Walks the player to a tile adjacent to `target`, one step at a time. */
function walkTo(
  pack: GamePack,
  from: TileCoord,
  target: TileCoord,
  apply: (action: GameAction) => void,
): TileCoord | null {
  // Find a walkable tile adjacent to the target.
  const candidates: TileCoord[] = [
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
    target,
  ].filter((tile) => isWalkable(pack.map, tile.x, tile.y));

  let best: TileCoord[] | null = null;
  for (const candidate of candidates) {
    const path = astar(pack.map, from, candidate);
    if (path && (!best || path.length < best.length)) best = path;
  }
  if (!best) return null;

  let position = from;
  for (const step of best) {
    const facing =
      step.x > position.x ? 'east' : step.x < position.x ? 'west' : step.y > position.y ? 'south' : 'north';
    apply({ type: 'move', position: step, facing });
    position = step;
  }
  return position;
}

export function playtest(pack: GamePack): PlaytestResult {
  let state = createInitialGameState(pack);
  const log: string[] = [];
  let steps = 0;

  const apply = (action: GameAction): void => {
    state = reduceGameState(pack, state, action);
    steps += 1;
  };

  // Repeat until no progress is possible. Each round completes at least one
  // objective, so the loop is bounded by the number of objectives.
  for (let round = 0; round < 500 && steps < MAX_STEPS; round += 1) {
    const active = pack.quests.filter(
      (q) => state.quests.find((p) => p.quest_id === q.id)?.status === 'active',
    );
    if (active.length === 0) break;

    let progressed = false;

    for (const quest of active) {
      const progress = state.quests.find((p) => p.quest_id === quest.id)!;

      for (const objective of quest.objectives) {
        if (progress.completed_objectives.includes(objective.id)) continue;

        // Resolve the target tile for this objective.
        let target: TileCoord | null = null;
        if (objective.npc_id) {
          target = pack.npcs.find((n) => n.id === objective.npc_id)?.position ?? null;
        } else if (objective.landmark_id) {
          target = pack.landmarks.find((l) => l.id === objective.landmark_id)?.entrance ?? null;
        }

        if (!target) {
          return { ok: false, steps, log, stuck: `objective ${objective.id} has no resolvable target`, quests: status(state) };
        }

        const reached = walkTo(pack, state.player.position, target, apply);
        if (!reached) {
          return { ok: false, steps, log, stuck: `cannot reach ${objective.id}`, quests: status(state) };
        }

        // Interact: talk to an NPC, or inspect a landmark.
        if (objective.npc_id) {
          apply({ type: 'talk', npcId: objective.npc_id });
          // Advance through any dialogue so it does not block the next step.
          let guard = 0;
          while (state.dialogue.npc_id !== null && guard < 20) {
            const tree = pack.dialogues.find((d) => d.npc_id === state.dialogue.npc_id);
            const node = tree?.nodes.find((n) => n.id === state.dialogue.node_id);
            const choice = node?.choices[0];
            if (choice) apply({ type: 'dialogue_choice', choiceId: choice.id });
            else apply({ type: 'close_dialogue' });
            guard += 1;
          }
          log.push(`talk ${objective.npc_id}`);
        } else if (objective.landmark_id) {
          const landmark = pack.landmarks.find((l) => l.id === objective.landmark_id)!;
          apply({ type: 'interact', interactionId: landmark.interaction_id });
          log.push(`inspect ${objective.landmark_id}`);
        }

        progressed = true;

        const after = state.quests.find((p) => p.quest_id === quest.id)!;
        if (after.status === 'completed') {
          log.push(`completed ${quest.id}`);
          break;
        }
      }
    }

    if (!progressed) {
      return { ok: false, steps, log, stuck: 'no progress (deadlock?)', quests: status(state) };
    }
  }

  const quests = status(state);
  const ok = Object.values(quests).every((s) => s === 'completed');
  return { ok, steps, log, quests };
}

function status(state: ReturnType<typeof createInitialGameState>): Record<string, 'locked' | 'active' | 'completed'> {
  return Object.fromEntries(state.quests.map((q) => [q.quest_id, q.status]));
}

/** Convenience: distance helper used by tests. */
export { manhattan };
