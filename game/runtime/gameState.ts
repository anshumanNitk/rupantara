import type { GamePack } from '../schemas/gamePack';
import type { GameState, QuestProgress } from '../schemas/gameState';
import type { Facing, TileCoord } from '../schemas/common';
import { isWalkable } from '../schemas/tilemap';

/**
 * Game runtime — a small, explicit, testable state machine.
 *
 * No ECS, no hidden mutation. Every transition is a pure function of
 * (pack, state, action). This is what makes quest progression deterministic and
 * unit-testable.
 */

export type GameAction =
  | { type: 'move'; position: TileCoord; facing: Facing }
  | { type: 'interact'; interactionId: string }
  | { type: 'talk'; npcId: string }
  | { type: 'dialogue_choice'; choiceId: string }
  | { type: 'close_dialogue' }
  | { type: 'reset' }
  | { type: 'set_preference'; key: 'reduced_motion' | 'high_contrast'; value: boolean };

export function createInitialGameState(pack: GamePack): GameState {
  const quests: QuestProgress[] = pack.quests.map((quest) => ({
    quest_id: quest.id,
    completed_objectives: [],
    status: quest.prerequisites.length === 0 ? 'active' : 'locked',
  }));

  return {
    schema_version: '1.0',
    world_fingerprint: pack.world.fingerprint,
    pack_version: pack.schema_version,
    player: { position: pack.spawn.position, facing: pack.spawn.facing, discovered: [] },
    quests,
    unlocks: [],
    codex: [],
    dialogue: { npc_id: null, node_id: null },
    preferences: { reduced_motion: false, high_contrast: false },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Marks an objective complete and cascades quest completion + unlocks. */
function completeObjective(
  pack: GamePack,
  state: GameState,
  questId: string,
  objectiveId: string,
): GameState {
  const quest = pack.quests.find((q) => q.id === questId);
  if (!quest) return state;

  const progress = state.quests.find((q) => q.quest_id === questId);
  if (!progress || progress.status === 'completed') return state;

  const completed = unique([...progress.completed_objectives, objectiveId]);
  const allDone = quest.objectives.every((o) => completed.includes(o.id));

  let next: GameState = {
    ...state,
    quests: state.quests.map((q) =>
      q.quest_id === questId
        ? { ...q, completed_objectives: completed, status: allDone ? 'completed' : 'active' }
        : q,
    ),
  };

  if (allDone) {
    next = { ...next, unlocks: unique([...next.unlocks, ...quest.rewards]) };
    // Activate any quest whose prerequisites are now all complete.
    next = {
      ...next,
      quests: next.quests.map((q) => {
        if (q.status !== 'locked') return q;
        const def = pack.quests.find((d) => d.id === q.quest_id);
        if (!def) return q;
        const ready = def.prerequisites.every(
          (prereq) => next.quests.find((x) => x.quest_id === prereq)?.status === 'completed',
        );
        return ready ? { ...q, status: 'active' } : q;
      }),
    };
  }

  return next;
}

/** Completes every objective that references the given interaction. */
function applyInteraction(pack: GamePack, state: GameState, interactionId: string): GameState {
  const interaction = pack.interactions.find((i) => i.id === interactionId);
  if (!interaction) return state;

  let next = state;

  if (interaction.effects.includes('reveal_codex') && interaction.architecture_entity_id !== null) {
    next = { ...next, codex: unique([...next.codex, interaction.architecture_entity_id]) };
  }
  if (interaction.effects.includes('grant_unlock')) {
    next = { ...next, unlocks: unique([...next.unlocks, ...interaction.grants]) };
  }

  for (const quest of pack.quests) {
    for (const objective of quest.objectives) {
      if (objective.interaction_id === interactionId) {
        next = completeObjective(pack, next, quest.id, objective.id);
      }
    }
  }

  return next;
}

export function reduceGameState(pack: GamePack, state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'move': {
      if (!isWalkable(pack.map, action.position.x, action.position.y)) return state;
      return { ...state, player: { ...state.player, position: action.position, facing: action.facing } };
    }

    case 'interact':
      return applyInteraction(pack, state, action.interactionId);

    case 'talk': {
      const npc = pack.npcs.find((n) => n.id === action.npcId);
      if (!npc) return state;
      const tree = pack.dialogues.find((d) => d.id === npc.dialogue_id);
      if (!tree) return state;

      let next: GameState = {
        ...state,
        dialogue: { npc_id: npc.id, node_id: tree.root },
        player: { ...state.player, discovered: unique([...state.player.discovered, npc.id]) },
      };

      // Talking satisfies any `talk` objective targeting this NPC.
      for (const quest of pack.quests) {
        for (const objective of quest.objectives) {
          if (objective.kind === 'talk' && objective.npc_id === npc.id) {
            next = completeObjective(pack, next, quest.id, objective.id);
          }
        }
      }
      return next;
    }

    case 'dialogue_choice': {
      const { npc_id, node_id } = state.dialogue;
      if (npc_id === null || node_id === null) return state;
      const tree = pack.dialogues.find((d) => d.npc_id === npc_id);
      const node = tree?.nodes.find((n) => n.id === node_id);
      const choice = node?.choices.find((c) => c.id === action.choiceId);
      if (!choice) return state;

      let next = state;
      if (choice.effects.includes('start_quest') && choice.quest_id !== null) {
        next = {
          ...next,
          quests: next.quests.map((q) =>
            q.quest_id === choice.quest_id && q.status === 'locked' ? { ...q, status: 'active' } : q,
          ),
        };
      }
      if (choice.effects.includes('grant_unlock')) {
        next = { ...next, unlocks: unique([...next.unlocks, choice.quest_id ?? '']) };
      }

      // A choice with no next node ends the conversation. Close it fully so the
      // world is not left frozen with a dangling npc_id and no node.
      if (choice.next === null) {
        return { ...next, dialogue: { npc_id: null, node_id: null } };
      }

      return { ...next, dialogue: { npc_id, node_id: choice.next } };
    }

    case 'close_dialogue':
      return { ...state, dialogue: { npc_id: null, node_id: null } };

    case 'reset':
      return createInitialGameState(pack);

    case 'set_preference':
      return { ...state, preferences: { ...state.preferences, [action.key]: action.value } };

    default:
      return state;
  }
}

/** The currently active quest, if any (first active in pack order). */
export function activeQuest(pack: GamePack, state: GameState) {
  return pack.quests.find((q) => state.quests.find((p) => p.quest_id === q.id)?.status === 'active') ?? null;
}

/** The next incomplete objective of a quest. */
export function nextObjective(pack: GamePack, state: GameState, questId: string) {
  const quest = pack.quests.find((q) => q.id === questId);
  const progress = state.quests.find((q) => q.quest_id === questId);
  if (!quest || !progress) return null;
  return quest.objectives.find((o) => !progress.completed_objectives.includes(o.id)) ?? null;
}
