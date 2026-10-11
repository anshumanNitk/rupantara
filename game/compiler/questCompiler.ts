import type { PlacedWorld } from '@/world/schemas/world';
import type { Landmark } from '../schemas/landmark';
import type { Npc, NpcRole } from '../schemas/npc';
import type { Interaction } from '../schemas/interaction';
import type { Quest, Objective, Quiz } from '../schemas/quest';
import type { DialogueTree } from '../schemas/dialogue';
import type { GameProvenance, TileCoord } from '../schemas/common';
import type { TileMap } from '../schemas/tilemap';
import { isWalkable, inBounds } from '../schemas/tilemap';
import { resolveLandmarkRole, resolveNpcRole, NPC_NODE_TYPES } from '../registries/semanticWorldRegistry';
import { spriteForRole } from '../registries/spriteRegistry';
import type { LandmarkPlacement } from './mapCompiler';
import {
  ambientGreeting,
  ambientTownsfolkName,
  ambientTownsfolkRole,
} from './storyWorld';

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

const TILE_KEY = (x: number, y: number): string => `${x},${y}`;

/**
 * Finds the closest walkable tile to `preferred` that is not occupied and is at
 * least `minEntranceDistance` tiles (manhattan) from every landmark entrance.
 *
 * This is what stops an NPC from standing on a landmark's entrance and
 * overshadowing it: NPCs are pushed to a nearby free tile instead.
 */
function findFreeNpcTile(
  map: TileMap,
  preferred: TileCoord,
  occupied: Set<string>,
  entrances: TileCoord[],
  minEntranceDistance: number,
): TileCoord {
  const neighbours: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  const visited = new Set<string>([TILE_KEY(preferred.x, preferred.y)]);
  const queue: TileCoord[] = [preferred];

  const isFree = (tile: TileCoord): boolean => {
    if (!isWalkable(map, tile.x, tile.y)) return false;
    if (occupied.has(TILE_KEY(tile.x, tile.y))) return false;
    for (const entrance of entrances) {
      const distance = Math.abs(entrance.x - tile.x) + Math.abs(entrance.y - tile.y);
      if (distance < minEntranceDistance) return false;
    }
    return true;
  };

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (isFree(current)) return current;

    for (const [dx, dy] of neighbours) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const key = TILE_KEY(nx, ny);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return preferred;
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
 * Builds a verifiable quiz about a component from the dependency graph.
 *
 * The correct answer is derived from real edges, never invented, so the quiz
 * genuinely tests understanding of the architecture. Returns null when the
 * graph does not give us a clean question (e.g. an isolated node).
 */
export function buildQuiz(
  entityId: string,
  placed: PlacedWorld,
  labelOf: (id: string) => string,
): Quiz | null {
  const outgoing = placed.connections.filter((c) => c.from === entityId);
  const incoming = placed.connections.filter((c) => c.to === entityId);

  const pick = (candidates: string[], exclude: Set<string>): string[] =>
    candidates.filter((id) => id !== entityId && !exclude.has(id)).slice(0, 2);

  /** Deterministic shuffle so the correct answer is not always first. */
  const arrange = (correct: string, wrong: string[]): { choices: string[]; correct: number } => {
    const all = [correct, ...wrong];
    let hash = 0x811c9dc5;
    for (let i = 0; i < entityId.length; i += 1) {
      hash ^= entityId.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const offset = (hash >>> 0) % all.length;
    const rotated = [...all.slice(offset), ...all.slice(0, offset)];
    return { choices: rotated.map(labelOf), correct: rotated.indexOf(correct) };
  };

  if (outgoing.length > 0) {
    const correct = outgoing[0]!.to;
    const wrong = pick(
      placed.entities.map((e) => e.id),
      new Set([correct, ...outgoing.map((c) => c.to)]),
    );
    if (wrong.length >= 2) {
      const { choices, correct: index } = arrange(correct, wrong);
      return {
        id: `quiz_${entityId}`,
        question: `Which of these does ${labelOf(entityId)} depend on?`,
        choices,
        correct: index,
        architecture_entity_id: entityId,
        success_text: `Correct — ${labelOf(entityId)} builds on ${labelOf(correct)}.`,
        failure_text: `Not quite. Follow the roads out of ${labelOf(entityId)} and try again.`,
      };
    }
  }

  if (incoming.length > 0) {
    const correct = incoming[0]!.from;
    const wrong = pick(
      placed.entities.map((e) => e.id),
      new Set([correct, ...incoming.map((c) => c.from)]),
    );
    if (wrong.length >= 2) {
      const { choices, correct: index } = arrange(correct, wrong);
      return {
        id: `quiz_${entityId}`,
        question: `Which of these relies on ${labelOf(entityId)}?`,
        choices,
        correct: index,
        architecture_entity_id: entityId,
        success_text: `Correct — ${labelOf(correct)} relies on ${labelOf(entityId)}.`,
        failure_text: `Not quite. Look at what flows into ${labelOf(entityId)} and try again.`,
      };
    }
  }

  return null;
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
  map: TileMap,
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

  // NPCs must never stand on a landmark entrance, or they would overshadow the
  // landmark and make it impossible to inspect. Track occupied tiles and keep
  // NPCs at least 2 tiles from every entrance.
  const entrances = landmarks.map((l) => l.entrance);
  const occupied = new Set<string>();
  const MIN_ENTRANCE_DISTANCE = 2;

  if (guideEntityId !== null) {
    const placement = placementByEntity.get(guideEntityId);
    const guideId = 'npc_guide';
    const dialogueId = `dialogue_${guideId}`;
    const preferred = placement?.entrance ?? { x: 0, y: 0 };
    const position = findFreeNpcTile(map, preferred, occupied, entrances, MIN_ENTRANCE_DISTANCE);
    occupied.add(TILE_KEY(position.x, position.y));

    npcs.push({
      id: guideId,
      label: 'The Guide',
      role: 'guide',
      position,
      wander: { radius: 1, speed: 0.45 },
      ambient: false,
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
    const position = findFreeNpcTile(map, placement.entrance, occupied, entrances, MIN_ENTRANCE_DISTANCE);
    occupied.add(TILE_KEY(position.x, position.y));

    npcs.push({
      id: npcId,
      label: entity.id,
      role,
      position,
      facing: 'south',
      sprite: spriteForRole(role).id,
      dialogue_id: dialogueId,
      architecture_entity_id: entity.id,
      quest_hooks: [],
      wander: { radius: 3, speed: 0.85 },
      ambient: false,
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

  // --- Ambient townsfolk: one per district so the streets are lived-in. ---
  const folkPerDistrict = new Map<string, number>();
  for (const district of map.districts) {
    const plazaTiles: TileCoord[] = [];
    for (let y = district.min.y; y <= district.max.y; y += 1) {
      for (let x = district.min.x; x <= district.max.x; x += 1) {
        if (isWalkable(map, x, y)) plazaTiles.push({ x, y });
      }
    }
    const count = Math.min(2, Math.max(1, Math.floor(plazaTiles.length / 18)));
    for (let i = 0; i < count; i += 1) {
      const seed = `${district.id}:${i}`;
      const preferred = plazaTiles[Math.floor((i * 7 + plazaTiles.length / 2) % plazaTiles.length)] ?? {
        x: district.min.x + 1,
        y: district.min.y + 1,
      };
      const position = findFreeNpcTile(map, preferred, occupied, entrances, MIN_ENTRANCE_DISTANCE);
      occupied.add(TILE_KEY(position.x, position.y));
      folkPerDistrict.set(district.id, (folkPerDistrict.get(district.id) ?? 0) + 1);

      const folkId = `npc_folk_${district.id}_${i}`;
      const dialogueId = `dialogue_${folkId}`;
      const role: NpcRole = ambientTownsfolkRole(seed);
      const name = ambientTownsfolkName(seed);
      const biome = district.biome;
      npcs.push({
        id: folkId,
        label: name,
        role,
        position,
        facing: i % 2 === 0 ? 'east' : 'west',
        sprite: spriteForRole(role).id,
        dialogue_id: dialogueId,
        architecture_entity_id: null,
        quest_hooks: [],
        wander: { radius: 4, speed: 0.7 + (i % 3) * 0.15 },
        ambient: true,
        provenance: { architecture_node_id: null, architecture_edge_id: null, source: null },
      });
      dialogues.push({
        id: dialogueId,
        npc_id: folkId,
        root: 'root',
        nodes: [
          {
            id: 'root',
            speaker: name,
            text: ambientGreeting(biome, seed),
            architecture_entity_id: null,
            choices: [
              { id: 'rumor', label: 'What is this place?', next: 'rumor', effects: [], quest_id: null },
              { id: 'bye', label: 'Carry on.', next: null, effects: [], quest_id: null },
            ],
          },
          {
            id: 'rumor',
            speaker: name,
            text: district.rumor ?? 'A district like any other, until you learn what it remembers.',
            architecture_entity_id: null,
            choices: [{ id: 'thanks', label: 'I will remember that.', next: null, effects: [], quest_id: null }],
          },
        ],
      });
    }
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
      quiz: null,
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

  // A verifiable quiz on the most central component: the player must prove they
  // understand how the realm fits together, not merely walk through it.
  const labelOf = (id: string): string => id;
  const quizEntity = order.find((id) => buildQuiz(id, placed, labelOf) !== null) ?? null;
  const surveyQuiz = quizEntity ? buildQuiz(quizEntity, placed, labelOf) : null;

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
      quiz: surveyQuiz,
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
      quiz: null,
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
