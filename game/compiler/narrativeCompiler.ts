import type { PlacedWorld } from '@/world/schemas/world';
import type { NarrativeGraph, Character, StoryBeat, Mission, Cutscene, MissionObjective } from '../schemas/narrative';
import type { Landmark } from '../schemas/landmark';
import type { Npc } from '../schemas/npc';
import { resolveLandmarkRole } from '../registries/semanticWorldRegistry';
import { topologicalOrder } from './questCompiler';

/**
 * Deterministic narrative compiler — the fallback "soul".
 *
 * When the Narrative Agent is unavailable (no API key, offline, or the service
 * is down), this produces a coherent, grounded story from the architecture
 * alone. It is template-based and fully deterministic: same world => same story.
 *
 * It is deliberately simpler than the LLM version, but it preserves the same
 * invariant: every character and mission references a real architecture node.
 */

export interface NarrativeCompileInput {
  placed: PlacedWorld;
  landmarks: Landmark[];
  npcs: Npc[];
  guideNpcId: string | null;
}

const ROLE_BY_ARCHETYPE: Record<string, Character['role']> = {
  guild_hall: 'guide',
  command_tower: 'sentinel',
  observatory: 'sentinel',
  town_hall: 'mentor',
  workshop: 'artisan',
  tower: 'mentor',
  archive: 'archivist',
  memory_vault: 'archivist',
  storehouse: 'archivist',
  dispatch_depot: 'messenger',
  courier_station: 'messenger',
  forge: 'artisan',
  laboratory: 'artisan',
  portal: 'ally',
  realm_gate: 'ally',
  camp: 'ally',
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A stable, readable character name derived from the component id. */
function characterName(entityId: string, role: Character['role']): string {
  const base = titleCase(entityId);
  switch (role) {
    case 'guide':
      return 'The Guide';
    case 'archivist':
      return `Archivist of ${base}`;
    case 'artisan':
      return `Artisan of ${base}`;
    case 'messenger':
      return `Courier of ${base}`;
    case 'sentinel':
      return `Sentinel of ${base}`;
    case 'mentor':
      return `Keeper of ${base}`;
    case 'villain':
      return `The Hollow of ${base}`;
    default:
      return `Warden of ${base}`;
  }
}

export function compileFallbackNarrative(input: NarrativeCompileInput): NarrativeGraph {
  const { placed, landmarks, npcs, guideNpcId } = input;
  const worldId = placed.world.id;
  const repoName = placed.world.name;

  const landmarkByEntity = new Map(landmarks.map((l) => [l.architecture_entity_id, l]));
  const order = topologicalOrder(placed).filter((id) => landmarkByEntity.has(id));

  // --- Characters: one per landmark, plus the guide. ---
  const characters: Character[] = [];
  const characterByEntity = new Map<string, Character>();

  for (const entityId of order) {
    const landmark = landmarkByEntity.get(entityId)!;
    const role = ROLE_BY_ARCHETYPE[landmark.archetype] ?? 'ally';
    const character: Character = {
      id: `char_${entityId}`,
      name: characterName(entityId, role),
      role,
      architecture_node_id: entityId,
      title: titleCase(landmark.semantic_type),
      backstory: `Long before you arrived, ${titleCase(entityId)} took its place in ${repoName}. It is a ${landmark.semantic_type.replace(/_/g, ' ')}, and the realm leans on it more than it admits.`,
      motivation: `To be understood for what it truly does, not merely visited.`,
      greeting: `So you have come to ${titleCase(entityId)}. Ask, and I will tell you what I remember.`,
      facts: [
        `${titleCase(entityId)} is a ${landmark.semantic_type.replace(/_/g, ' ')}.`,
        `It stands in the ${landmark.region_id ?? 'heart'} of the realm.`,
      ],
      portrait_prompt: `pixel-art portrait of a ${role} character representing a ${landmark.semantic_type}, warm fantasy palette`,
    };
    characters.push(character);
    characterByEntity.set(entityId, character);
  }

  const guideEntityId = guideNpcId
    ? npcs.find((n) => n.id === guideNpcId)?.architecture_entity_id ?? null
    : null;
  const guideCharacter = guideEntityId ? characterByEntity.get(guideEntityId) ?? null : null;
  if (guideCharacter) {
    guideCharacter.role = 'guide';
    guideCharacter.name = 'The Guide';
    guideCharacter.backstory = `The Guide has watched ${repoName} take shape and knows every road between its halls.`;
    guideCharacter.motivation = 'To see the realm understood, end to end.';
    guideCharacter.greeting = `Welcome to ${repoName}. This realm is a repository made walkable. Shall I show you around?`;
  }

  // --- Beats: a fixed dramatic arc. ---
  const beats: StoryBeat[] = [
    { id: 'beat_prologue', kind: 'prologue', title: 'The Summons', summary: `You are called into ${repoName}.`, mission_ids: [], prerequisites: [] },
    { id: 'beat_arrival', kind: 'arrival', title: 'Arrival', summary: 'Meet the Guide and learn why you are here.', mission_ids: ['mission_arrival'], prerequisites: ['beat_prologue'] },
    { id: 'beat_learn', kind: 'learn', title: 'The Survey', summary: 'Walk the realm and learn what each hall remembers.', mission_ids: ['mission_survey'], prerequisites: ['beat_arrival'] },
    { id: 'beat_conflict', kind: 'conflict', title: 'The Fracture', summary: 'Something in the realm is failing.', mission_ids: ['mission_fracture'], prerequisites: ['beat_learn'] },
    { id: 'beat_climax', kind: 'climax', title: 'The Reckoning', summary: 'Confront the heart of the realm.', mission_ids: ['mission_finale'], prerequisites: ['beat_conflict'] },
    { id: 'beat_epilogue', kind: 'epilogue', title: 'The Understanding', summary: 'You see the whole.', mission_ids: [], prerequisites: ['beat_climax'] },
  ];

  // --- Missions. ---
  const surveyObjectives: MissionObjective[] = order.map((entityId) => ({
    id: `obj_visit_${entityId}`,
    text: `Inspect ${titleCase(entityId)}.`,
    kind: 'inspect',
    landmark_id: `landmark_${entityId}`,
    npc_id: null,
    architecture_node_id: entityId,
  }));

  // The "fracture" targets the most depended-upon component (highest in-degree).
  const inDegree = new Map<string, number>();
  for (const connection of placed.connections) {
    inDegree.set(connection.to, (inDegree.get(connection.to) ?? 0) + 1);
  }
  const centralEntity =
    [...order].sort((a, b) => (inDegree.get(b) ?? 0) - (inDegree.get(a) ?? 0) || a.localeCompare(b))[0] ??
    order[0] ??
    null;

  const missions: Mission[] = [];

  if (guideEntityId) {
    missions.push({
      id: 'mission_arrival',
      title: 'The Summons',
      kind: 'main',
      beat_id: 'beat_arrival',
      hook: 'Someone is waiting for you at the gate.',
      stakes: `Before you can understand ${repoName}, you must meet the one who keeps it.`,
      objectives: [
        { id: 'obj_meet_guide', text: 'Speak with the Guide.', kind: 'talk', landmark_id: null, npc_id: 'npc_guide', architecture_node_id: guideEntityId },
      ],
      prerequisites: [],
      concepts: ['guide'],
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: 'cs_prologue',
      outro_cutscene_id: null,
    });
  }

  if (surveyObjectives.length > 0) {
    missions.push({
      id: 'mission_survey',
      title: 'The Survey',
      kind: 'main',
      beat_id: 'beat_learn',
      hook: 'Every hall remembers a part of the system.',
      stakes: `You cannot understand ${repoName} until you have seen each of its parts.`,
      objectives: surveyObjectives,
      prerequisites: guideEntityId ? ['mission_arrival'] : [],
      concepts: order,
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: null,
    });
  }

  if (centralEntity) {
    const centralChar = characterByEntity.get(centralEntity);
    missions.push({
      id: 'mission_fracture',
      title: 'The Fracture',
      kind: 'trial',
      beat_id: 'beat_conflict',
      hook: `${titleCase(centralEntity)} is straining under everything that leans on it.`,
      stakes: `The realm's most depended-upon component is where understanding matters most.`,
      objectives: [
        { id: 'obj_fracture', text: `Return to ${titleCase(centralEntity)} and see what depends on it.`, kind: 'inspect', landmark_id: `landmark_${centralEntity}`, npc_id: null, architecture_node_id: centralEntity },
      ],
      prerequisites: surveyObjectives.length > 0 ? ['mission_survey'] : [],
      concepts: [centralEntity],
      giver_id: centralChar?.id ?? null,
      intro_cutscene_id: 'cs_fracture',
      outro_cutscene_id: null,
    });
  }

  if (guideEntityId) {
    missions.push({
      id: 'mission_finale',
      title: 'The Reckoning',
      kind: 'finale',
      beat_id: 'beat_climax',
      hook: 'Return to the Guide and see the whole realm at once.',
      stakes: `This is where the pieces become a system.`,
      objectives: [
        { id: 'obj_finale', text: 'Return to the Guide to see the realm whole.', kind: 'talk', landmark_id: null, npc_id: 'npc_guide', architecture_node_id: guideEntityId },
      ],
      prerequisites: centralEntity ? ['mission_fracture'] : surveyObjectives.length > 0 ? ['mission_survey'] : [],
      concepts: ['runtime'],
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: 'cs_epilogue',
    });
  }

  // --- Cutscenes. ---
  const cutscenes: Cutscene[] = [
    {
      id: 'cs_prologue',
      title: 'The Summons',
      beat_id: 'beat_prologue',
      lines: [
        { speaker_id: null, text: `A realm called ${repoName} stirs in the dark.`, direction: 'fade in' },
        { speaker_id: guideCharacter?.id ?? null, text: 'You have arrived. Few ever do.', direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: 'Walk with me. I will show you what this place remembers.', direction: null },
      ],
    },
  ];

  if (centralEntity) {
    cutscenes.push({
      id: 'cs_fracture',
      title: 'The Fracture',
      beat_id: 'beat_conflict',
      lines: [
        { speaker_id: null, text: `A tremor runs through ${titleCase(centralEntity)}.`, direction: 'camera shakes' },
        { speaker_id: characterByEntity.get(centralEntity)?.id ?? null, text: 'Everything leans on me. Everything.', direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: 'Now you see why it matters.', direction: null },
      ],
    });
  }

  if (guideEntityId) {
    cutscenes.push({
      id: 'cs_epilogue',
      title: 'The Understanding',
      beat_id: 'beat_epilogue',
      lines: [
        { speaker_id: guideCharacter?.id ?? null, text: `You have walked every road of ${repoName}.`, direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: 'You no longer see halls. You see a system.', direction: null },
        { speaker_id: null, text: 'The realm is understood.', direction: 'fade out' },
      ],
    });
  }

  return {
    schema_version: '1.0',
    world_id: worldId,
    premise: `${repoName} is a realm built from real components. Each hall, vault and forge is a part of the system, and each remembers something the others depend on.`,
    central_conflict: centralEntity
      ? `${titleCase(centralEntity)} carries more of the realm than any other place, and it is beginning to strain.`
      : 'The realm has grown faster than its understanding.',
    learning_promise: `By the end you will understand how ${repoName} fits together: what each component does, how they depend on one another, and where the whole system's weight truly rests.`,
    characters,
    beats,
    missions,
    cutscenes,
    prologue_cutscene_id: 'cs_prologue',
    epilogue_cutscene_id: guideEntityId ? 'cs_epilogue' : null,
    finale_mission_id: guideEntityId ? 'mission_finale' : missions[missions.length - 1]?.id ?? null,
  };
}
