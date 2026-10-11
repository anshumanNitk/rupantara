import type { PlacedWorld } from '@/world/schemas/world';
import type { DialogueTree } from '../schemas/dialogue';
import type { DialogueChoice } from '../schemas/dialogue';
import type { GameProvenance, TileCoord } from '../schemas/common';
import type { Landmark } from '../schemas/landmark';
import type { Npc, NpcRole } from '../schemas/npc';
import type { Quest } from '../schemas/quest';
import type { TileMap } from '../schemas/tilemap';
import { inBounds, isWalkable } from '../schemas/tilemap';
import type { NarrativeGraph, NarrativeRole } from '../schemas/narrative';
import { buildQuiz } from './questCompiler';

/**
 * Turns the Narrative Agent's safe story data into the things the player can
 * actually meet and complete.  This is deliberately a compiler rather than a
 * renderer concern: an agent may write flavour, but placement, target repair
 * and quest state remain deterministic and fully validated.
 */

export interface NarrativeGameplayInput {
  placed: PlacedWorld;
  map: TileMap;
  landmarks: Landmark[];
  npcs: Npc[];
  dialogues: DialogueTree[];
  baseQuests: Quest[];
  narrative: NarrativeGraph;
}

export interface NarrativeGameplayResult {
  narrative: NarrativeGraph;
  npcs: Npc[];
  dialogues: DialogueTree[];
  quests: Quest[];
}

const roleToNpcRole: Record<NarrativeRole, NpcRole> = {
  guide: 'guide',
  mentor: 'scholar',
  guardian: 'sentinel',
  artisan: 'artisan',
  archivist: 'scholar',
  messenger: 'courier',
  sentinel: 'sentinel',
  villain: 'sentinel',
  ally: 'wanderer',
};

/**
 * Deterministically removes prerequisite edges that would close a cycle.
 *
 * The Narrative Agent is asked for a DAG, but a creative model sometimes writes
 * a genuine loop ("m_loop" requires "m_finale" which requires "m_loop"). A loop
 * makes every quest on it permanently locked, so the pack would be unwinnable.
 * The model proposes; the compiler disposes: edges are considered in a fixed
 * order and any edge whose target can already reach its source is dropped.
 */
export function breakPrerequisiteCycles<T extends { id: string; prerequisites: string[] }>(items: T[]): T[] {
  const kept = new Map<string, string[]>(items.map((item) => [item.id, []]));

  const reaches = (from: string, target: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(kept.get(current) ?? []));
    }
    return false;
  };

  // Stable order: by item position, then prerequisite order as written.
  for (const item of items) {
    for (const prereq of item.prerequisites) {
      if (prereq === item.id || !kept.has(prereq)) continue;
      // Adding item -> prereq creates a cycle iff prereq already reaches item.
      if (reaches(prereq, item.id)) continue;
      kept.get(item.id)!.push(prereq);
    }
  }

  return items.map((item) => ({ ...item, prerequisites: kept.get(item.id) ?? [] }));
}

function provenanceFor(entityId: string, placed: PlacedWorld): GameProvenance {
  return {
    architecture_node_id: entityId,
    architecture_edge_id: null,
    source: placed.entities.find((entity) => entity.id === entityId)?.provenance?.source ?? null,
  };
}

/** Finds a free, reachable tile while keeping the doorway readable. */
function findFreeStoryTile(map: TileMap, preferred: TileCoord, occupied: Set<string>, entrances: TileCoord[]): TileCoord {
  const queue = [preferred];
  const seen = new Set<string>([`${preferred.x},${preferred.y}`]);
  const steps: Array<readonly [number, number]> = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  while (queue.length > 0) {
    const tile = queue.shift()!;
    const key = `${tile.x},${tile.y}`;
    const doorwayClear = entrances.every((entry) => Math.abs(entry.x - tile.x) + Math.abs(entry.y - tile.y) >= 2);
    if (doorwayClear && isWalkable(map, tile.x, tile.y) && !occupied.has(key)) return tile;

    for (const [dx, dy] of steps) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (!seen.has(nextKey) && inBounds(map, next.x, next.y)) {
        seen.add(nextKey);
        queue.push(next);
      }
    }
  }

  return preferred;
}

/**
 * Makes character dialogue and missions playable.  A narrative character gets
 * a physical NPC near the component they embody; the old generic quest chain
 * is replaced by the narrative missions, so the story agent is no longer just
 * a side-panel author.
 */
export function compileNarrativeGameplay(input: NarrativeGameplayInput): NarrativeGameplayResult {
  const { placed, map, landmarks } = input;
  // Repair genuine prerequisite loops before anything else reads the story, so
  // the Missions panel and the runtime quest graph always agree.
  const narrative: NarrativeGraph = {
    ...input.narrative,
    missions: breakPrerequisiteCycles(
      input.narrative.missions.map((mission) => ({ ...mission, prerequisites: [...mission.prerequisites] })),
    ),
  };
  const landmarkByEntity = new Map(landmarks.map((landmark) => [landmark.architecture_entity_id, landmark]));
  const npcs = [...input.npcs];
  const occupied = new Set(npcs.map((npc) => `${npc.position.x},${npc.position.y}`));
  const entrances = landmarks.map((landmark) => landmark.entrance);
  const npcForEntity = new Map<string, string>();
  for (const npc of npcs) {
    if (npc.architecture_entity_id) npcForEntity.set(npc.architecture_entity_id, npc.id);
  }

  // Give every named character a body in the world. Existing semantic NPCs
  // are reused; architecture landmarks receive a companion NPC nearby.
  for (const character of narrative.characters) {
    const existingId = npcForEntity.get(character.architecture_node_id);
    if (existingId) {
      const index = npcs.findIndex((npc) => npc.id === existingId);
      if (index >= 0) {
        const existing = npcs[index]!;
        npcs[index] = {
          ...existing,
          label: character.name,
          role: roleToNpcRole[character.role],
          sprite: roleToNpcRole[character.role],
          wander: existing.wander ?? { radius: character.role === 'guide' ? 1 : 3, speed: 0.65 },
          ambient: false,
        };
      }
      continue;
    }
    const landmark = landmarkByEntity.get(character.architecture_node_id);
    const preferred = landmark?.entrance ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
    const position = findFreeStoryTile(map, preferred, occupied, entrances);
    const npcId = `npc_${character.architecture_node_id}`;
    occupied.add(`${position.x},${position.y}`);
    npcForEntity.set(character.architecture_node_id, npcId);
    npcs.push({
      id: npcId,
      label: character.name,
      role: roleToNpcRole[character.role],
      position,
      facing: 'south',
      sprite: roleToNpcRole[character.role],
      dialogue_id: `dialogue_${npcId}`,
      architecture_entity_id: character.architecture_node_id,
      quest_hooks: [],
      wander: { radius: character.role === 'guide' ? 1 : 3, speed: character.role === 'messenger' ? 1.1 : 0.65 },
      ambient: false,
      provenance: provenanceFor(character.architecture_node_id, placed),
    });
  }

  const characterByEntity = new Map(narrative.characters.map((character) => [character.architecture_node_id, character]));
  const missionIds = new Set(narrative.missions.map((mission) => mission.id));

  const rawQuests: Quest[] = narrative.missions.map((mission, missionIndex) => {
    const normalizedObjectives = mission.objectives.map((objective, objectiveIndex) => {
      const entityId = objective.architecture_node_id ?? null;
      const landmark = entityId ? landmarkByEntity.get(entityId) : objective.landmark_id ? landmarks.find((item) => item.id === objective.landmark_id) : undefined;
      const npcId = entityId ? npcForEntity.get(entityId) ?? null : objective.npc_id && npcs.some((npc) => npc.id === objective.npc_id) ? objective.npc_id : null;

      // A talk objective is always attached to a real character. Other verbs
      // prefer the real landmark, falling back to that character when a node
      // has no landmark of its own.
      const talks = objective.kind === 'talk';
      const targetNpc = talks ? npcId : landmark ? null : npcId;
      const targetLandmark = talks ? null : landmark ?? null;
      const interactionId = targetLandmark ? targetLandmark.interaction_id : null;
      const kind = targetNpc ? (talks ? 'talk' : 'visit') : objective.kind === 'talk' ? 'inspect' : objective.kind;

      return {
        id: objective.id || `objective_${missionIndex}_${objectiveIndex}`,
        kind,
        description: objective.text,
        landmark_id: targetLandmark?.id ?? null,
        npc_id: targetNpc,
        interaction_id: interactionId,
        architecture_entity_id: entityId,
      } as Quest['objectives'][number];
    }).filter((objective) => objective.landmark_id !== null || objective.npc_id !== null);

    // A malformed agent mission must not make a pack unwinnable. Anchor it to
    // a known place instead; the agent's prose remains visible, while the
    // engine controls what can be played.
    if (normalizedObjectives.length === 0) {
      const fallback = landmarks[0];
      if (fallback) normalizedObjectives.push({
        id: `objective_${mission.id}`,
        kind: 'inspect',
        description: 'Inspect the first clue in the realm.',
        landmark_id: fallback.id,
        npc_id: null,
        interaction_id: fallback.interaction_id,
        architecture_entity_id: fallback.architecture_entity_id,
      });
    }

    // Progression is knowledge-gated. Each main/trial mission ends with a
    // question derived from a real dependency, so reaching the next route
    // means the player understood the last one rather than merely walked by.
    const learningEntity = normalizedObjectives.find((objective) => objective.architecture_entity_id !== null)?.architecture_entity_id ?? null;
    const quiz = learningEntity && mission.kind !== 'side'
      ? buildQuiz(learningEntity, placed, (id) => id)
      : mission.id === narrative.finale_mission_id
        ? input.baseQuests.find((quest) => quest.quiz !== null)?.quiz ?? null
        : null;
    return {
      id: mission.id,
      title: mission.title,
      summary: `${mission.hook} ${mission.stakes}`,
      objectives: normalizedObjectives,
      prerequisites: mission.prerequisites.filter((id) => missionIds.has(id)),
      rewards: [`story_${mission.id}`],
      concepts: mission.concepts,
      main_path: mission.kind !== 'side',
      quiz,
    };
  }).filter((quest) => quest.objectives.length > 0);

  // Dropped missions must not leave dangling prerequisites behind, and a quest
  // graph must stay acyclic after filtering.
  const survivingIds = new Set(rawQuests.map((quest) => quest.id));
  const quests = breakPrerequisiteCycles(
    rawQuests.map((quest) => ({
      ...quest,
      prerequisites: quest.prerequisites.filter((id) => survivingIds.has(id)),
    })),
  );

  const questIds = new Set(quests.map((quest) => quest.id));
  const activeNpcs = npcs.map((npc) => {
    const hooks = narrative.missions
      .filter((mission) => {
        if (!questIds.has(mission.id)) return false;
        if (mission.giver_id && characterByEntity.get(npc.architecture_entity_id ?? '')?.id === mission.giver_id) return true;
        return mission.objectives.some((objective) => objective.architecture_node_id === npc.architecture_entity_id);
      })
      .map((mission) => mission.id);
    return { ...npc, quest_hooks: [...new Set(hooks)].sort() };
  });

  const dialogues: DialogueTree[] = activeNpcs.map((npc) => {
    const character = npc.architecture_entity_id ? characterByEntity.get(npc.architecture_entity_id) : undefined;
    if (!character) {
      return input.dialogues.find((dialogue) => dialogue.id === npc.dialogue_id) ?? {
        id: npc.dialogue_id,
        npc_id: npc.id,
        root: 'root',
        nodes: [{
          id: 'root',
          speaker: npc.label,
          text: 'The roads are busy today.',
          architecture_entity_id: null,
          choices: [{ id: 'leave', label: 'Carry on.', next: null, effects: [], quest_id: null }],
        }],
      };
    }
    const hook = npc.quest_hooks[0] ?? null;
    const fact = character.facts[0] ?? character.motivation;
    const rumor = character.facts[1] ?? character.backstory;
    const rootChoices: DialogueChoice[] = [
      { id: 'ask_work', label: 'What do you do here?', next: 'work', effects: [], quest_id: null },
      { id: 'ask_story', label: 'Tell me what this hall remembers.', next: 'story', effects: [], quest_id: null },
    ];
    if (hook) {
      rootChoices.unshift({
        id: 'accept_mission',
        label: 'What do you need from me?',
        next: 'mission',
        effects: ['start_quest'],
        quest_id: hook,
      });
    }
    rootChoices.push({ id: 'leave', label: 'I will return.', next: null, effects: [], quest_id: null });

    return {
      id: npc.dialogue_id,
      npc_id: npc.id,
      root: 'root',
      nodes: [
        {
          id: 'root',
          speaker: character.name,
          text: character.greeting,
          architecture_entity_id: character.architecture_node_id,
          choices: rootChoices,
        },
        {
          id: 'work',
          speaker: character.name,
          text: fact,
          architecture_entity_id: character.architecture_node_id,
          choices: [
            { id: 'work_story', label: 'And what do you want?', next: 'want', effects: [], quest_id: null },
            { id: 'work_back', label: 'I should keep walking.', next: null, effects: [], quest_id: null },
          ],
        },
        {
          id: 'story',
          speaker: character.name,
          text: rumor,
          architecture_entity_id: character.architecture_node_id,
          choices: [
            { id: 'story_want', label: 'What do you want from me?', next: 'want', effects: [], quest_id: null },
            { id: 'story_back', label: 'I will remember that.', next: null, effects: [], quest_id: null },
          ],
        },
        {
          id: 'want',
          speaker: character.name,
          text: character.motivation,
          architecture_entity_id: character.architecture_node_id,
          choices: hook
            ? [
                { id: 'want_mission', label: 'Then I will help.', next: 'mission', effects: ['start_quest'], quest_id: hook },
                { id: 'want_leave', label: 'Not yet.', next: null, effects: [], quest_id: null },
              ]
            : [{ id: 'want_leave', label: 'I will return.', next: null, effects: [], quest_id: null }],
        },
        {
          id: 'mission',
          speaker: character.name,
          text: character.backstory,
          architecture_entity_id: character.architecture_node_id,
          choices: [{ id: 'mission_go', label: 'I am on my way.', next: null, effects: [], quest_id: null }],
        },
      ],
    };
  });

  // Keep the narrative panel itself grounded in the NPCs and landmarks we just
  // compiled. This repairs harmless agent naming mismatches before validation.
  const normalizedNarrative: NarrativeGraph = {
    ...narrative,
    missions: narrative.missions.map((mission) => ({
      ...mission,
      objectives: mission.objectives.map((objective) => {
        const entityId = objective.architecture_node_id ?? null;
        const landmark = entityId ? landmarkByEntity.get(entityId) : undefined;
        const npcId = entityId ? npcForEntity.get(entityId) ?? null : null;
        return {
          ...objective,
          landmark_id: objective.kind === 'talk' ? null : landmark?.id ?? null,
          npc_id: objective.kind === 'talk' || !landmark ? npcId : null,
        };
      }),
    })),
  };

  return { narrative: normalizedNarrative, npcs: activeNpcs, dialogues, quests };
}
