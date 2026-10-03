import type { PlacedWorld } from '@/world/schemas/world';
import type { Landmark } from '../schemas/landmark';
import type { Npc } from '../schemas/npc';
import type { Interaction } from '../schemas/interaction';
import type { Quest, Objective } from '../schemas/quest';
import type { DialogueTree } from '../schemas/dialogue';
import type { GameProvenance } from '../schemas/common';
import { resolveLandmarkRole, resolveNpcRole, NPC_NODE_TYPES } from '../registries/semanticWorldRegistry';
import { spriteForRole } from '../registries/spriteRegistry';
import type { LandmarkPlacement } from './mapCompiler';

/**
 * Quest compiler — deterministic, template-based quests and NPCs.
 *
 * Quests are compiled from graph topology, not authored by a model. The first
 * release uses a guided narrative: meet the guide, survey the realm in
 * dependency order, then watch the process replay.
 */

export interface QuestCompileResult {
  landmarks: Landmark[];
  npcs: Npc[];
  interactions: Interaction[];
  quests: Quest[];
  dialogues: DialogueTree[];
  guideNpcId: string | null;
}

function provenanceFor(entityId: string, placed: PlacedWorld): GameProvenance {
  const entity = placed.entities.find((e) => e.id === entityId);
  return {
    architecture_node_id: entityId,
    architecture_edge_id: null,
    source: entity?.provenance?.source ?? null,
  };
}

/**
 * Deterministic topological order of nodes. Ties are broken by id so the order
 * never depends on input ordering. Nodes in cycles are appended in id order.
 */
export function topologicalOrder(placed: PlacedWorld): string[] {
  const ids = placed.entities.map((e) => e.id).sort((a, b) => a.localeCompare(b));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const connection of [...placed.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!indegree.has(connection.from) || !indegree.has(connection.to)) continue;
    adjacency.get(connection.from)!.push(connection.to);
    indegree.set(connection.to, (indegree.get(connection.to) ?? 0) + 1);
  }

  const ready = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort((a, b) => a.localeCompare(b));
  const order: string[] = [];

  while (ready.length > 0) {
    const current = ready.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  for (const id of ids) {
    if (!order.includes(id)) order.push(id);
  }

  return order;
}

export function compileQuests(
  placed: PlacedWorld,
  placements: LandmarkPlacement[],
): QuestCompileResult {
  const placementByEntity = new Map(placements.map((p) => [p.entityId, p]));

  // --- Landmarks: every non-NPC entity becomes a landmark. ---
  const landmarks: Landmark[] = [];
  const interactions: Interaction[] = [];

  for (const entity of [...placed.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    const isNpc = NPC_NODE_TYPES.has(entity.semantic_type as never);
    if (isNpc) continue;

    const placement = placementByEntity.get(entity.id);
    if (!placement) continue;

    const role = resolveLandmarkRole(entity.semantic_type);
    const interactionId = `inspect_${entity.id}`;

    interactions.push({
      id: interactionId,
      kind: 'inspect',
      prompt: `Inspect ${entity.id}`,
      architecture_entity_id: entity.id,
      dialogue_id: null,
      effects: ['reveal_codex'],
      grants: [],
    });

    landmarks.push({
      id: `landmark_${entity.id}`,
      label: entity.id,
      architecture_entity_id: entity.id,
      semantic_type: entity.semantic_type,
      archetype: role.archetype,
      anchor: placement.anchor,
      footprint: placement.footprint,
      entrance: placement.entrance,
      interaction_id: interactionId,
      region_id: placement.regionId,
      provenance: provenanceFor(entity.id, placed),
    });
  }

  // --- Guide NPC: prefer a hub landmark (agent), else the first landmark. ---
  const hubEntity = [...placed.entities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((e) => resolveLandmarkRole(e.semantic_type).hub);
  const guideEntityId = hubEntity?.id ?? landmarks[0]?.architecture_entity_id ?? null;

  const npcs: Npc[] = [];
  const dialogues: DialogueTree[] = [];

  if (guideEntityId !== null) {
    const placement = placementByEntity.get(guideEntityId);
    const guideId = 'npc_guide';
    const dialogueId = `dialogue_${guideId}`;

    npcs.push({
      id: guideId,
      label: 'The Guide',
      role: 'guide',
      position: placement?.entrance ?? { x: 0, y: 0 },
      facing: 'south',
      sprite: spriteForRole('guide').id,
      dialogue_id: dialogueId,
      architecture_entity_id: guideEntityId,
      quest_hooks: ['q_arrival', 'q_survey'],
      provenance: provenanceFor(guideEntityId, placed),
    });

    dialogues.push({
      id: dialogueId,
      npc_id: guideId,
      root: 'root',
      nodes: [
        {
          id: 'root',
          speaker: 'The Guide',
          text: 'Welcome, traveller. This realm is a repository made walkable. Shall I show you around?',
          architecture_entity_id: guideEntityId,
          choices: [
            { id: 'accept', label: 'Show me the realm.', next: 'survey', effects: ['start_quest'], quest_id: 'q_survey' },
            { id: 'later', label: 'Not yet.', next: null, effects: [], quest_id: null },
          ],
        },
        {
          id: 'survey',
          speaker: 'The Guide',
          text: 'Follow the roads. Inspect each hall you pass — every one remembers a part of the system.',
          architecture_entity_id: guideEntityId,
          choices: [{ id: 'ok', label: 'Understood.', next: null, effects: [], quest_id: null }],
        },
      ],
    });
  }

  // --- NPCs for user/task nodes. ---
  for (const entity of [...placed.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!NPC_NODE_TYPES.has(entity.semantic_type as never)) continue;
    const placement = placementByEntity.get(entity.id);
    if (!placement) continue;

    const npcId = `npc_${entity.id}`;
    const dialogueId = `dialogue_${npcId}`;
    const role = resolveNpcRole(entity.semantic_type);

    npcs.push({
      id: npcId,
      label: entity.id,
      role,
      position: placement.entrance,
      facing: 'south',
      sprite: spriteForRole(role).id,
      dialogue_id: dialogueId,
      architecture_entity_id: entity.id,
      quest_hooks: [],
      provenance: provenanceFor(entity.id, placed),
    });

    dialogues.push({
      id: dialogueId,
      npc_id: npcId,
      root: 'root',
      nodes: [
        {
          id: 'root',
          speaker: entity.id,
          text: `I am ${entity.id}. I carry work into this realm.`,
          architecture_entity_id: entity.id,
          choices: [{ id: 'bye', label: 'Safe travels.', next: null, effects: [], quest_id: null }],
        },
      ],
    });
  }

  // --- Quests: guided chain in dependency order. ---
  const quests: Quest[] = [];
  const order = topologicalOrder(placed).filter((id) =>
    landmarks.some((l) => l.architecture_entity_id === id),
  );

  if (guideEntityId !== null) {
    quests.push({
      id: 'q_arrival',
      title: 'Arrival',
      summary: 'Meet the Guide who keeps this realm.',
      objectives: [
        {
          id: 'obj_meet_guide',
          kind: 'talk',
          description: 'Speak with the Guide.',
          landmark_id: null,
          npc_id: 'npc_guide',
          interaction_id: null,
          architecture_entity_id: guideEntityId,
        },
      ],
      prerequisites: [],
      rewards: ['codex_unlocked'],
      concepts: ['guide'],
      main_path: true,
    });
  }

  const surveyObjectives: Objective[] = order.map((entityId) => ({
    id: `obj_inspect_${entityId}`,
    kind: 'inspect',
    description: `Inspect ${entityId}.`,
    landmark_id: `landmark_${entityId}`,
    npc_id: null,
    interaction_id: `inspect_${entityId}`,
    architecture_entity_id: entityId,
  }));

  if (surveyObjectives.length > 0) {
    quests.push({
      id: 'q_survey',
      title: 'Survey the Realm',
      summary: 'Visit every hall and learn what each one remembers.',
      objectives: surveyObjectives,
      prerequisites: guideEntityId !== null ? ['q_arrival'] : [],
      rewards: ['realm_surveyed'],
      concepts: order,
      main_path: true,
    });
  }

  if (guideEntityId !== null) {
    quests.push({
      id: 'q_replay',
      title: 'Watch the Process',
      summary: 'Return to the Guide and watch the realm come alive.',
      objectives: [
        {
          id: 'obj_replay',
          kind: 'visit',
          description: 'Return to the Guide to replay the process.',
          landmark_id: null,
          npc_id: 'npc_guide',
          interaction_id: null,
          architecture_entity_id: guideEntityId,
        },
      ],
      prerequisites: surveyObjectives.length > 0 ? ['q_survey'] : ['q_arrival'],
      rewards: ['replay_unlocked'],
      concepts: ['runtime'],
      main_path: false,
    });
  }

  return {
    landmarks,
    npcs,
    interactions,
    quests,
    dialogues,
    guideNpcId: guideEntityId !== null ? 'npc_guide' : null,
  };
}
