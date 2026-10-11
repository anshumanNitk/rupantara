import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Narrative contracts — the "soul" layer.
 *
 * Mirrors `services/architecture/contracts.py`. The Narrative Agent turns an
 * Architecture Graph into a story: characters, beats, missions, cutscenes and
 * an ending.
 *
 * INVARIANT: narrative is a deterministic interpretation of the architecture.
 * Every character and mission objective references a real architecture node id.
 * The agent may invent prose, never components.
 */

export const NARRATIVE_ROLES = [
  'guide',
  'mentor',
  'guardian',
  'artisan',
  'archivist',
  'messenger',
  'sentinel',
  'villain',
  'ally',
] as const;
export const NarrativeRoleSchema = z.enum(NARRATIVE_ROLES);
export type NarrativeRole = z.infer<typeof NarrativeRoleSchema>;

export const BEAT_KINDS = [
  'prologue',
  'arrival',
  'meet',
  'learn',
  'conflict',
  'resolve',
  'reveal',
  'climax',
  'epilogue',
] as const;
export const BeatKindSchema = z.enum(BEAT_KINDS);
export type BeatKind = z.infer<typeof BeatKindSchema>;

export const MISSION_KINDS = ['main', 'side', 'trial', 'finale'] as const;
export const MissionKindSchema = z.enum(MISSION_KINDS);
export type MissionKind = z.infer<typeof MissionKindSchema>;

export const CharacterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  role: NarrativeRoleSchema,
  architecture_node_id: z.string().min(1),
  title: z.string().nullish(),
  backstory: z.string().min(1),
  motivation: z.string().min(1),
  greeting: z.string().min(1),
  facts: z.array(z.string()).default([]),
  portrait_prompt: z.string().nullish(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CutsceneLineSchema = z.object({
  speaker_id: z.string().nullish(),
  text: z.string().min(1),
  direction: z.string().nullish(),
});
export type CutsceneLine = z.infer<typeof CutsceneLineSchema>;

export const CutsceneSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  lines: z.array(CutsceneLineSchema).default([]),
  beat_id: z.string().nullish(),
});
export type Cutscene = z.infer<typeof CutsceneSchema>;

export const MissionObjectiveSchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  kind: z.enum(['visit', 'inspect', 'talk', 'collect', 'unlock']),
  landmark_id: z.string().nullish(),
  npc_id: z.string().nullish(),
  architecture_node_id: z.string().nullish(),
});
export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;

export const MissionSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  kind: MissionKindSchema,
  beat_id: IdSchema,
  hook: z.string().min(1),
  stakes: z.string().min(1),
  objectives: z.array(MissionObjectiveSchema).default([]),
  prerequisites: z.array(IdSchema).default([]),
  concepts: z.array(z.string()).default([]),
  giver_id: z.string().nullish(),
  intro_cutscene_id: z.string().nullish(),
  outro_cutscene_id: z.string().nullish(),
});
export type Mission = z.infer<typeof MissionSchema>;

export const StoryBeatSchema = z.object({
  id: IdSchema,
  kind: BeatKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  mission_ids: z.array(IdSchema).default([]),
  prerequisites: z.array(IdSchema).default([]),
});
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

export const StoryLocationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** A rumor, custom or overheard line about this place. */
  rumor: z.string().min(1),
  /** Optional district this location flavours. */
  district_id: z.string().nullish(),
  /** Optional architecture node this place embodies. */
  architecture_node_id: z.string().nullish(),
  biome: z.string().nullish(),
});
export type StoryLocation = z.infer<typeof StoryLocationSchema>;

export const NarrativeGraphSchema = z.object({
  schema_version: z.literal('1.0'),
  world_id: z.string().min(1),
  premise: z.string().min(1),
  central_conflict: z.string().min(1),
  learning_promise: z.string().min(1),
  characters: z.array(CharacterSchema).default([]),
  beats: z.array(StoryBeatSchema).default([]),
  missions: z.array(MissionSchema).default([]),
  cutscenes: z.array(CutsceneSchema).default([]),
  /** Named places the compiler stamps onto districts. Advisory flavour. */
  locations: z.array(StoryLocationSchema).default([]),
  prologue_cutscene_id: z.string().nullish(),
  epilogue_cutscene_id: z.string().nullish(),
  finale_mission_id: z.string().nullish(),
});
export type NarrativeGraph = z.infer<typeof NarrativeGraphSchema>;
