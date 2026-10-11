// ============================================================================
// Game Pack schema: the contract between your AI pipeline and the runtime.
// Everything is declarative JSON (no code), so packs are safe to load.
// Coordinates: map tiles are [x, y]; in 3D, tile x -> world x, tile y -> world z, up = +y.
// ============================================================================
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** Renderer-agnostic procedural geometry. Primitives are positioned by BASE CENTER (y up). */
export interface ShapeSpec {
  type: string; // box|cylinder|cone|pyramid|sphere|group  OR a registered macro (tree, house, ...)
  position?: Vec3;
  size?: Vec3; // box / pyramid: [w, h, d]
  radius?: number;
  height?: number;
  segments?: number;
  color?: string;
  roofColor?: string;
  rotate?: number; // degrees about Y
  children?: ShapeSpec[];
  [extra: string]: unknown;
}

export interface SpriteSpec {
  url?: string;
  frame?: { cols: number; rows: number; index?: number };
  procedural?: { skin?: string; hair?: string; shirt?: string; pants?: string };
  width?: number; // world units
  height?: number;
}

/** What an entity wants to look like. The AssetResolver decides how to satisfy it. */
export interface AssetRequest {
  ref?: string; // "oak tree", "server rack" -> resolved through the provider chain
  tags?: string[];
  shape?: ShapeSpec; // inline procedural geometry (always wins)
  sprite?: SpriteSpec; // inline sprite
  scale?: number;
  tint?: string;
}

export type Condition =
  | { flag: string; equals?: unknown }
  | { has: string; n?: number }
  | { quest: string; state?: 'locked' | 'active' | 'done' };

/** Whitelisted, declarative actions. Packs never contain executable code. */
export type Action =
  | { do: 'say'; text: string }
  | { do: 'dialogue'; id: string }
  | { do: 'give'; item: string; n?: number }
  | { do: 'take'; item: string; n?: number }
  | { do: 'flag'; key: string; value?: unknown }
  | { do: 'toggle'; entity?: string } // hide + unblock (door opens, pickup vanishes)
  | { do: 'teleport'; to: Vec2 }
  | { do: 'emit'; event: string; data?: unknown };

export interface InteractionDef {
  label?: string;
  requires?: Condition[];
  failText?: string;
  usedText?: string;
  once?: boolean;
  actions: Action[];
}

export interface EntityDef {
  id: string;
  kind: 'player' | 'npc' | 'object' | 'item' | 'trigger';
  name?: string;
  pos: Vec2;
  size?: Vec2; // footprint in tiles (default 1x1)
  asset?: AssetRequest;
  blocks?: boolean; // default: true for 'object', false otherwise
  interact?: InteractionDef;
  npc?: {
    persona?: string;
    facts?: string[]; // grounding facts (later: pulled from your evidence graph w/ provenance)
    dialogueId?: string; // scripted tree (also the fallback for LLM NPCs)
    llm?: boolean; // let an LLM provider handle free-form dialogue
    wander?: { radius: number; speed?: number };
  };
  trigger?: { radius: number; actions: Action[]; once?: boolean };
  state?: Record<string, unknown>;
}

export interface TileDef { terrain: string; walkable: boolean; color: string; height?: number }

export interface Objective {
  id: string;
  text: string;
  type: 'talk' | 'interact' | 'collect' | 'flag' | 'reach';
  target?: string; // entity id | item id | flag key
  n?: number;
  at?: Vec2;
  radius?: number;
}

export interface Quest {
  id: string;
  title: string;
  description?: string;
  prerequisites?: string[];
  objectives: Objective[];
  rewards?: Action[];
  learningGoal?: string;
}

export interface DialogueNode {
  speaker?: string;
  text: string;
  next?: string;
  actions?: Action[];
  choices?: { text: string; next?: string; requires?: Condition[]; actions?: Action[] }[];
}
export interface DialogueTree { start: string; nodes: Record<string, DialogueNode> }

export interface GamePack {
  version: string;
  meta: { title: string; theme?: string; seed?: number; source?: Record<string, unknown> };
  style?: { camera?: 'iso' | 'rpg'; pixelScale?: number; background?: string };
  map: { width: number; height: number; rows: string[]; legend: Record<string, TileDef> };
  entities: EntityDef[];
  items?: Record<string, { name: string; description?: string }>;
  quests: Quest[];
  dialogues: Record<string, DialogueTree>;
}

// ---- Dialogue provider contract (scripted today, LLM tomorrow, same interface) ----
export interface DialogueTurn {
  speaker: string;
  text: string;
  choices?: string[];
  allowText?: boolean; // free-text input allowed (LLM NPCs)
  end?: boolean; // show text, then close on next input
  silent?: boolean; // close immediately
  actions?: Action[];
}
export type DialogueInput =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'choice'; index: number }
  | { type: 'text'; text: string };

export interface DialogueCtx {
  npc: EntityDef;
  pack: GamePack;
  treeId?: string;
  flags: Record<string, unknown>;
  inventory: Record<string, number>;
  activeObjectives: string[];
  history: { role: 'npc' | 'player'; text: string }[];
  mem: Record<string, any>; // provider scratch space (per conversation)
  check(c?: Condition[]): boolean;
  run(a?: Action[]): void;
}
export interface DialogueProvider {
  name: string;
  canHandle(npc: EntityDef, ctx: DialogueCtx): boolean;
  respond(ctx: DialogueCtx, input: DialogueInput): Promise<DialogueTurn>;
}
