import type { GamePack } from '../schemas/gamePack';
import type { TileCoord } from '../schemas/common';
import type { Npc } from '../schemas/npc';
import type { Landmark } from '../schemas/landmark';
import type { Quest } from '../schemas/quest';
import type { DialogueTree } from '../schemas/dialogue';
import { isWalkable, inBounds } from '../schemas/tilemap';
import { validateGamePack } from '../compiler/validators';
import type { AssetResolver } from '../registries/assetResolver';

/**
 * PackBuilder — validated, declarative editing of a GamePack.
 *
 * This is how an LLM agent builds or edits a pack WITHOUT ever emitting code or
 * coordinates directly. Every mutation is bounds-checked and overlap-checked,
 * and errors are returned as DATA (not thrown) so the model can self-correct.
 *
 * The tool surface mirrors the reference toolkit's `PackBuilder`:
 *   describe_pack · search_assets · paint_tiles · find_free_spot
 *   place_landmark · place_npc · add_quest · add_dialogue · validate_pack
 *
 * Nothing here executes model-authored code. The model proposes; the builder
 * disposes.
 */

export interface ToolResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'describe_pack',
    description: 'Summarize the current pack: map size, landmarks, NPCs, quests, dialogues.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_assets',
    description:
      "Check whether an asset exists. 'by' tells which provider serves it; by='placeholder' means NOT available.",
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'find_free_spot',
    description: 'Nearest walkable, unoccupied tile to a position.',
    input_schema: {
      type: 'object',
      properties: {
        near: { type: 'array', items: { type: 'number' }, description: '[x, y]' },
        size: { type: 'array', items: { type: 'number' }, description: '[w, h]' },
      },
      required: ['near'],
    },
  },
  {
    name: 'place_landmark',
    description: 'Add a landmark. Validates bounds and overlap.',
    input_schema: { type: 'object', properties: { landmark: { type: 'object' } }, required: ['landmark'] },
  },
  {
    name: 'place_npc',
    description: 'Add an NPC. Validates bounds, overlap and that it is not on a landmark entrance.',
    input_schema: { type: 'object', properties: { npc: { type: 'object' } }, required: ['npc'] },
  },
  {
    name: 'add_quest',
    description: 'Add or replace a quest (objectives, prerequisites, rewards).',
    input_schema: { type: 'object', properties: { quest: { type: 'object' } }, required: ['quest'] },
  },
  {
    name: 'add_dialogue',
    description: 'Add or replace a scripted dialogue tree.',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, tree: { type: 'object' } }, required: ['id', 'tree'] },
  },
  {
    name: 'validate_pack',
    description: 'Run all validators and return issues.',
    input_schema: { type: 'object', properties: {} },
  },
];

export class PackBuilder {
  constructor(
    public pack: GamePack,
    private resolver: AssetResolver | null = null,
  ) {}

  /** Tiles occupied by landmark footprints. */
  private occupied(): Set<string> {
    const occupied = new Set<string>();
    for (const landmark of this.pack.landmarks) {
      for (let y = landmark.anchor.y; y < landmark.anchor.y + landmark.footprint.h; y += 1) {
        for (let x = landmark.anchor.x; x < landmark.anchor.x + landmark.footprint.w; x += 1) {
          occupied.add(`${x},${y}`);
        }
      }
    }
    return occupied;
  }

  private entranceTiles(): Set<string> {
    return new Set(this.pack.landmarks.map((l) => `${l.entrance.x},${l.entrance.y}`));
  }

  private npcTiles(): Set<string> {
    return new Set(this.pack.npcs.map((n) => `${n.position.x},${n.position.y}`));
  }

  /** Errors are returned as data so a model can retry. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    try {
      return await this.dispatch(name, args);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async dispatch(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const pack = this.pack;

    switch (name) {
      case 'describe_pack':
        return {
          ok: true,
          title: pack.world.name,
          map: { width: pack.map.width, height: pack.map.height },
          landmarks: pack.landmarks.map((l) => ({ id: l.id, anchor: l.anchor, archetype: l.archetype })),
          npcs: pack.npcs.map((n) => ({ id: n.id, position: n.position, role: n.role })),
          quests: pack.quests.map((q) => q.id),
          dialogues: pack.dialogues.map((d) => d.id),
        };

      case 'search_assets': {
        const query = String(args.query ?? '');
        if (!this.resolver) return { ok: false, error: 'no asset resolver configured' };
        const resolution = await this.resolver.resolve({ ref: query });
        return {
          ok: resolution.kind !== 'placeholder',
          by: resolution.by,
          kind: resolution.kind,
        };
      }

      case 'find_free_spot': {
        const near = args.near as [number, number];
        const size = (args.size as [number, number]) ?? [1, 1];
        if (!Array.isArray(near)) return { ok: false, error: 'near must be [x, y]' };

        const occupied = this.occupied();
        const npcTiles = this.npcTiles();
        const entrances = this.entranceTiles();

        for (let radius = 0; radius < 16; radius += 1) {
          for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
              let ok = true;
              for (let j = 0; j < size[1] && ok; j += 1) {
                for (let i = 0; i < size[0] && ok; i += 1) {
                  const x = near[0] + dx + i;
                  const y = near[1] + dy + j;
                  const key = `${x},${y}`;
                  ok =
                    isWalkable(pack.map, x, y) &&
                    !occupied.has(key) &&
                    !npcTiles.has(key) &&
                    !entrances.has(key);
                }
              }
              if (ok) return { ok: true, pos: [near[0] + dx, near[1] + dy] };
            }
          }
        }
        return { ok: false, error: 'no free spot nearby' };
      }

      case 'place_landmark': {
        const landmark = args.landmark as Landmark;
        if (!landmark?.id || !landmark.anchor || !landmark.footprint) {
          return { ok: false, error: 'landmark needs id, anchor {x,y} and footprint {w,h}' };
        }
        if (pack.landmarks.some((l) => l.id === landmark.id)) {
          return { ok: false, error: `landmark id '${landmark.id}' already exists` };
        }

        const occupied = this.occupied();
        for (let y = landmark.anchor.y; y < landmark.anchor.y + landmark.footprint.h; y += 1) {
          for (let x = landmark.anchor.x; x < landmark.anchor.x + landmark.footprint.w; x += 1) {
            if (!inBounds(pack.map, x, y)) return { ok: false, error: `[${x},${y}] is out of bounds` };
            if (occupied.has(`${x},${y}`)) return { ok: false, error: `[${x},${y}] already occupied` };
          }
        }
        if (!isWalkable(pack.map, landmark.entrance.x, landmark.entrance.y)) {
          return { ok: false, error: `entrance [${landmark.entrance.x},${landmark.entrance.y}] is not walkable` };
        }

        pack.landmarks.push(landmark);
        return { ok: true };
      }

      case 'place_npc': {
        const npc = args.npc as Npc;
        if (!npc?.id || !npc.position) return { ok: false, error: 'npc needs id and position {x,y}' };
        if (pack.npcs.some((n) => n.id === npc.id)) {
          return { ok: false, error: `npc id '${npc.id}' already exists` };
        }
        if (!isWalkable(pack.map, npc.position.x, npc.position.y)) {
          return { ok: false, error: `[${npc.position.x},${npc.position.y}] is not walkable` };
        }
        if (this.entranceTiles().has(`${npc.position.x},${npc.position.y}`)) {
          return { ok: false, error: 'an NPC may not stand on a landmark entrance' };
        }
        if (this.npcTiles().has(`${npc.position.x},${npc.position.y}`)) {
          return { ok: false, error: 'another NPC already stands there' };
        }

        pack.npcs.push(npc);
        return { ok: true };
      }

      case 'add_quest': {
        const quest = args.quest as Quest;
        if (!quest?.id) return { ok: false, error: 'quest needs an id' };
        pack.quests = pack.quests.filter((q) => q.id !== quest.id);
        pack.quests.push(quest);
        return { ok: true };
      }

      case 'add_dialogue': {
        const id = String(args.id ?? '');
        const tree = args.tree as DialogueTree;
        if (!id || !tree) return { ok: false, error: 'add_dialogue needs id and tree' };
        pack.dialogues = pack.dialogues.filter((d) => d.id !== id);
        pack.dialogues.push({ ...tree, id });
        return { ok: true };
      }

      case 'validate_pack': {
        const issues = validateGamePack(pack);
        return { ok: issues.length === 0, issues };
      }

      default:
        return { ok: false, error: `unknown tool '${name}'` };
    }
  }
}

/** Convenience: the nearest free tile, or null. */
export function findFreeSpot(
  pack: GamePack,
  near: TileCoord,
  size: { w: number; h: number } = { w: 1, h: 1 },
): TileCoord | null {
  const builder = new PackBuilder(pack);
  const occupied = new Set<string>();
  for (const landmark of pack.landmarks) {
    for (let y = landmark.anchor.y; y < landmark.anchor.y + landmark.footprint.h; y += 1) {
      for (let x = landmark.anchor.x; x < landmark.anchor.x + landmark.footprint.w; x += 1) {
        occupied.add(`${x},${y}`);
      }
    }
  }
  void builder;

  for (let radius = 0; radius < 16; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        let ok = true;
        for (let j = 0; j < size.h && ok; j += 1) {
          for (let i = 0; i < size.w && ok; i += 1) {
            const x = near.x + dx + i;
            const y = near.y + dy + j;
            ok = isWalkable(pack.map, x, y) && !occupied.has(`${x},${y}`);
          }
        }
        if (ok) return { x: near.x + dx, y: near.y + dy };
      }
    }
  }
  return null;
}
