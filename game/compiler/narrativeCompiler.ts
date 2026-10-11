import type { PlacedWorld } from '@/world/schemas/world';
import type { NarrativeGraph, Character, StoryBeat, Mission, Cutscene, MissionObjective, StoryLocation } from '../schemas/narrative';
import type { Landmark } from '../schemas/landmark';
import type { Npc } from '../schemas/npc';
import { topologicalOrder } from './questCompiler';
import { characterFullName, districtRumor } from './storyWorld';

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

function roleVoice(role: Character['role'], hall: string, repoName: string): { backstory: string; motivation: string; greeting: string } {
  switch (role) {
    case 'archivist':
      return {
        backstory: `${hall} keeps what ${repoName} cannot afford to forget. Its keeper has spent years cataloguing every debt the other halls owe this place, and has grown tired of being treated as furniture.`,
        motivation: `To make the rest of the realm admit that without memory, nothing they build survives the night.`,
        greeting: `Speak softly. The shelves of ${hall} are listening, and they have a long memory for careless visitors.`,
      };
    case 'artisan':
      return {
        backstory: `Every tool that leaves ${hall} is used somewhere else and blamed somewhere else. The maker who lives here has stopped expecting thanks and started expecting understanding.`,
        motivation: `To show you the fire, not the product — so you stop treating ${hall} as a black box.`,
        greeting: `Hands off the workbench. If you want to know what ${hall} does, you will have to watch it work.`,
      };
    case 'messenger':
      return {
        backstory: `Nothing in ${repoName} stays put. ${hall} is where work becomes motion, and the runner who keeps it has seen more of the realm than anyone who sits still.`,
        motivation: `To prove that the roads between halls matter as much as the halls themselves.`,
        greeting: `Keep up. ${hall} does not wait, and neither do I.`,
      };
    case 'sentinel':
      return {
        backstory: `From ${hall} you can see which parts of ${repoName} are load-bearing. The watcher posted here noticed the strain long before anyone else would admit it.`,
        motivation: `To make you look up — really look — before the next failure arrives.`,
        greeting: `You are late. ${hall} has been signalling for longer than you have been walking.`,
      };
    case 'mentor':
      return {
        backstory: `${hall} is where decisions are made that other halls merely obey. Its keeper still believes a traveller can be taught the shape of the whole, if they will sit still.`,
        motivation: `To turn a visitor into someone who can explain ${repoName} without pointing at a map.`,
        greeting: `Sit. ${hall} has a lesson, and it will not be shorter because you are in a hurry.`,
      };
    case 'villain':
      return {
        backstory: `${hall} drinks the weight of everything that leans on it. It did not ask to be the heart, and it is beginning to hollow.`,
        motivation: `To be relieved of a burden nobody else will name.`,
        greeting: `So. Another one come to stare at the crack in ${hall}.`,
      };
    case 'guide':
      return {
        backstory: `The Guide has walked every road of ${repoName} and still cannot make the halls speak to each other without a translator.`,
        motivation: `To see the realm understood, end to end, by someone who did not build it.`,
        greeting: `Welcome to ${repoName}. This realm is a repository made walkable. Shall I show you around?`,
      };
    default:
      return {
        backstory: `${hall} has always been here, quieter than the halls that shout. Its warden knows a side of ${repoName} the main road never shows.`,
        motivation: `To be counted as part of the system, not scenery.`,
        greeting: `You found ${hall}. Most people do not. That already says something.`,
      };
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

  const incomingOf = (id: string) => placed.connections.filter((c) => c.to === id).map((c) => c.from);
  const outgoingOf = (id: string) => placed.connections.filter((c) => c.from === id).map((c) => c.to);

  for (const entityId of order) {
    const landmark = landmarkByEntity.get(entityId)!;
    const role = ROLE_BY_ARCHETYPE[landmark.archetype] ?? 'ally';
    const hall = titleCase(entityId);
    const voice = roleVoice(role, hall, repoName);
    const dependsOn = outgoingOf(entityId).map(titleCase);
    const reliedOnBy = incomingOf(entityId).map(titleCase);
    const character: Character = {
      id: `char_${entityId}`,
      name: characterFullName(entityId, role),
      role,
      architecture_node_id: entityId,
      title: `${titleCase(landmark.semantic_type)} of ${hall}`,
      backstory: voice.backstory,
      motivation: voice.motivation,
      greeting: voice.greeting,
      facts: [
        `${hall} is a ${landmark.semantic_type.replace(/_/g, ' ')} in ${repoName}.`,
        dependsOn.length > 0
          ? `${hall} depends on ${dependsOn.slice(0, 3).join(', ')}.`
          : `${hall} is a foundation: nothing beneath it, everything above.`,
        reliedOnBy.length > 0
          ? `${reliedOnBy.slice(0, 3).join(', ')} ${reliedOnBy.length === 1 ? 'leans' : 'lean'} on ${hall}.`
          : `Few halls admit they need ${hall}. That is not the same as not needing it.`,
      ],
      portrait_prompt: `pixel-art full-body RPG character, ${role} named for ${hall}, warm fantasy palette, expressive face, unique clothing`,
    };
    characters.push(character);
    characterByEntity.set(entityId, character);
  }

  const guideEntityId = guideNpcId
    ? npcs.find((n) => n.id === guideNpcId)?.architecture_entity_id ?? null
    : null;
  const guideCharacter = guideEntityId ? characterByEntity.get(guideEntityId) ?? null : null;
  if (guideCharacter) {
    const voice = roleVoice('guide', titleCase(guideEntityId!), repoName);
    guideCharacter.role = 'guide';
    guideCharacter.name = characterFullName(guideEntityId!, 'guide');
    guideCharacter.title = `Guide of ${repoName}`;
    guideCharacter.backstory = voice.backstory;
    guideCharacter.motivation = voice.motivation;
    guideCharacter.greeting = voice.greeting;
  }

  const inDegree = new Map<string, number>();
  for (const connection of placed.connections) {
    inDegree.set(connection.to, (inDegree.get(connection.to) ?? 0) + 1);
  }
  const centralEntity =
    [...order].sort((a, b) => (inDegree.get(b) ?? 0) - (inDegree.get(a) ?? 0) || a.localeCompare(b))[0] ??
    order[0] ??
    null;

  const leafEntities = order.filter((id) => outgoingOf(id).length === 0 && id !== centralEntity);
  const firstHalls = order.filter((id) => id !== centralEntity && id !== guideEntityId).slice(0, 3);
  const sideEntity = leafEntities[0] ?? firstHalls[firstHalls.length - 1] ?? null;
  const witnessEntity = firstHalls.find((id) => id !== sideEntity) ?? firstHalls[0] ?? null;

  const beats: StoryBeat[] = [
    { id: 'beat_prologue', kind: 'prologue', title: 'The Summons', summary: `A traveller is called into ${repoName} because the halls have stopped agreeing with each other.`, mission_ids: [], prerequisites: [] },
    { id: 'beat_arrival', kind: 'arrival', title: 'The First Road', summary: 'Meet the Guide and learn why the realm is restless.', mission_ids: ['mission_arrival'], prerequisites: ['beat_prologue'] },
    { id: 'beat_meet', kind: 'meet', title: 'Faces of the Realm', summary: 'The halls have keepers. Meet the one who will not be ignored.', mission_ids: witnessEntity ? ['mission_meet'] : [], prerequisites: ['beat_arrival'] },
    { id: 'beat_learn', kind: 'learn', title: 'The Load-Bearing Halls', summary: 'Walk the halls that everything else leans on.', mission_ids: ['mission_foundations'], prerequisites: ['beat_meet'] },
    { id: 'beat_conflict', kind: 'conflict', title: 'The Fracture', summary: 'The most depended-upon hall is beginning to fail.', mission_ids: ['mission_fracture'], prerequisites: ['beat_learn'] },
    { id: 'beat_climax', kind: 'climax', title: 'The Reckoning', summary: 'Name the system out loud, and the realm can rest.', mission_ids: ['mission_finale'], prerequisites: ['beat_conflict'] },
    { id: 'beat_epilogue', kind: 'epilogue', title: 'The Understanding', summary: 'You see the whole.', mission_ids: [], prerequisites: ['beat_climax'] },
  ];

  const missions: Mission[] = [];

  if (guideEntityId) {
    missions.push({
      id: 'mission_arrival',
      title: 'The First Road',
      kind: 'main',
      beat_id: 'beat_arrival',
      hook: `${guideCharacter?.name ?? 'The Guide'} is waiting where the first hall meets the road.`,
      stakes: `Until you hear why ${repoName} called you, every other hall will treat you as a tourist.`,
      objectives: [
        { id: 'obj_meet_guide', text: `Speak with ${guideCharacter?.name ?? 'the Guide'}.`, kind: 'talk', landmark_id: null, npc_id: 'npc_guide', architecture_node_id: guideEntityId },
      ],
      prerequisites: [],
      concepts: ['guide'],
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: 'cs_prologue',
      outro_cutscene_id: null,
    });
  }

  if (witnessEntity) {
    const witness = characterByEntity.get(witnessEntity);
    missions.push({
      id: 'mission_meet',
      title: `A Word with ${witness?.name ?? titleCase(witnessEntity)}`,
      kind: 'main',
      beat_id: 'beat_meet',
      hook: `${witness?.name ?? titleCase(witnessEntity)} has a grievance the Guide will not name.`,
      stakes: `The realm is not only halls. It is people who live inside them, and they remember different truths.`,
      objectives: [
        {
          id: 'obj_meet_witness',
          text: `Visit ${titleCase(witnessEntity)} and hear what ${witness?.name ?? 'its keeper'} remembers.`,
          kind: 'inspect',
          landmark_id: `landmark_${witnessEntity}`,
          npc_id: null,
          architecture_node_id: witnessEntity,
        },
      ],
      prerequisites: guideEntityId ? ['mission_arrival'] : [],
      concepts: [witnessEntity],
      giver_id: witness?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: null,
    });
  }

  const foundationTargets = (firstHalls.length > 0 ? firstHalls : order).slice(0, 3);
  if (foundationTargets.length > 0) {
    const foundationObjectives: MissionObjective[] = foundationTargets.map((entityId) => ({
      id: `obj_visit_${entityId}`,
      text: `Inspect ${titleCase(entityId)} and learn what leans on it.`,
      kind: 'inspect',
      landmark_id: `landmark_${entityId}`,
      npc_id: null,
      architecture_node_id: entityId,
    }));
    missions.push({
      id: 'mission_foundations',
      title: 'The Load-Bearing Halls',
      kind: 'main',
      beat_id: 'beat_learn',
      hook: 'Not every hall is equal. Some carry the rest.',
      stakes: `If you cannot name the foundations of ${repoName}, you cannot see where it will crack.`,
      objectives: foundationObjectives,
      prerequisites: witnessEntity ? ['mission_meet'] : guideEntityId ? ['mission_arrival'] : [],
      concepts: foundationTargets,
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: null,
    });
  }

  if (sideEntity && sideEntity !== centralEntity) {
    const sideChar = characterByEntity.get(sideEntity);
    missions.push({
      id: 'mission_side_rumor',
      title: `Rumor of ${titleCase(sideEntity)}`,
      kind: 'side',
      beat_id: 'beat_learn',
      hook: `${sideChar?.name ?? titleCase(sideEntity)} has heard a rumor the main road will not carry.`,
      stakes: 'Side streets remember what the official story forgets.',
      objectives: [
        {
          id: 'obj_side_talk',
          text: `Follow the rumor to ${titleCase(sideEntity)}.`,
          kind: 'inspect',
          landmark_id: `landmark_${sideEntity}`,
          npc_id: null,
          architecture_node_id: sideEntity,
        },
      ],
      prerequisites: guideEntityId ? ['mission_arrival'] : [],
      concepts: [sideEntity],
      giver_id: sideChar?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: null,
    });
    const learnBeat = beats.find((b) => b.id === 'beat_learn');
    if (learnBeat) learnBeat.mission_ids = [...learnBeat.mission_ids, 'mission_side_rumor'];
  }

  if (centralEntity) {
    const centralChar = characterByEntity.get(centralEntity);
    missions.push({
      id: 'mission_fracture',
      title: 'The Fracture',
      kind: 'trial',
      beat_id: 'beat_conflict',
      hook: `${titleCase(centralEntity)} is straining under everything that leans on it.`,
      stakes: `The realm's most depended-upon hall is where understanding matters most — and where it will fail first.`,
      objectives: [
        { id: 'obj_fracture', text: `Stand in ${titleCase(centralEntity)} and see what depends on it.`, kind: 'inspect', landmark_id: `landmark_${centralEntity}`, npc_id: null, architecture_node_id: centralEntity },
      ],
      prerequisites: foundationTargets.length > 0 ? ['mission_foundations'] : witnessEntity ? ['mission_meet'] : [],
      concepts: [centralEntity],
      giver_id: centralChar?.id ?? null,
      intro_cutscene_id: 'cs_fracture',
      outro_cutscene_id: null,
    });
  }

  if (guideEntityId) {
    missions.push({
      id: 'mission_finale',
      title: 'Name the System',
      kind: 'finale',
      beat_id: 'beat_climax',
      hook: `Return to ${guideCharacter?.name ?? 'the Guide'} and say, out loud, how ${repoName} actually works.`,
      stakes: 'A realm that cannot be named cannot be kept.',
      objectives: [
        { id: 'obj_finale', text: `Return to ${guideCharacter?.name ?? 'the Guide'} and name the whole.`, kind: 'talk', landmark_id: null, npc_id: 'npc_guide', architecture_node_id: guideEntityId },
      ],
      prerequisites: centralEntity ? ['mission_fracture'] : foundationTargets.length > 0 ? ['mission_foundations'] : [],
      concepts: ['runtime'],
      giver_id: guideCharacter?.id ?? null,
      intro_cutscene_id: null,
      outro_cutscene_id: 'cs_epilogue',
    });
  }

  const cutscenes: Cutscene[] = [
    {
      id: 'cs_prologue',
      title: 'The Summons',
      beat_id: 'beat_prologue',
      lines: [
        { speaker_id: null, text: `Night over ${repoName}. The halls are lit, but they are not speaking to each other.`, direction: 'fade in' },
        { speaker_id: guideCharacter?.id ?? null, text: 'You came. Good. The roads still hold, but the weight is shifting.', direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: 'Walk with me. I will not explain the realm. I will make you meet it.', direction: null },
      ],
    },
  ];

  if (centralEntity) {
    const centralName = characterByEntity.get(centralEntity)?.name ?? titleCase(centralEntity);
    cutscenes.push({
      id: 'cs_fracture',
      title: 'The Fracture',
      beat_id: 'beat_conflict',
      lines: [
        { speaker_id: null, text: `A tremor runs through ${titleCase(centralEntity)}. Dust falls from a beam that was never meant to be decorative.`, direction: 'camera shakes' },
        { speaker_id: characterByEntity.get(centralEntity)?.id ?? null, text: `I am ${centralName}. Everything leans on this hall. Everything. And nobody asked if it could hold.`, direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: 'Now you see the shape. Not a collection of buildings. A system with a single point of strain.', direction: null },
      ],
    });
  }

  if (guideEntityId) {
    cutscenes.push({
      id: 'cs_epilogue',
      title: 'The Understanding',
      beat_id: 'beat_epilogue',
      lines: [
        { speaker_id: guideCharacter?.id ?? null, text: `Say it. Not the names of the halls — the way they lean.`, direction: null },
        { speaker_id: guideCharacter?.id ?? null, text: `${repoName} is no longer a map. It is a sentence you can finish.`, direction: null },
        { speaker_id: null, text: 'The realm is understood. The roads go quiet, and stay.', direction: 'fade out' },
      ],
    });
  }

  const locations: StoryLocation[] = [];
  const seenRegions = new Set<string>();
  for (const landmark of landmarks) {
    const region = landmark.region_id;
    if (!region || seenRegions.has(region)) continue;
    seenRegions.add(region);
    locations.push({
      id: `loc_${region}`,
      name: titleCase(region.replace(/^zone_/, '')),
      rumor: districtRumor('commons', region),
      district_id: region,
      architecture_node_id: landmark.architecture_entity_id,
      biome: null,
    });
  }

  return {
    schema_version: '1.0',
    world_id: worldId,
    premise: `${repoName} is not a diagram. It is a town whose halls are real components, whose roads are real dependencies, and whose people remember debts the source tree never wrote down.`,
    central_conflict: centralEntity
      ? `${titleCase(centralEntity)} carries more of ${repoName} than any other hall, and the strain is beginning to show in the roads that lead there.`
      : `The realm of ${repoName} has grown faster than anyone's understanding of it.`,
    learning_promise: `By the end you will be able to name how ${repoName} fits together: which halls are foundations, which are load-bearing, who depends on whom, and where the whole system's weight truly rests.`,
    characters,
    beats,
    missions,
    cutscenes,
    locations,
    prologue_cutscene_id: 'cs_prologue',
    epilogue_cutscene_id: guideEntityId ? 'cs_epilogue' : null,
    finale_mission_id: guideEntityId ? 'mission_finale' : missions[missions.length - 1]?.id ?? null,
  };
}
