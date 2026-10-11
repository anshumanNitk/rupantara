import type { AssetResolver } from '../assets/resolver';
import type { DialogueTree, EntityDef, GamePack, Quest } from '../core/types';
import { validatePack } from '../core/validate';

// ============================================================================
// Agent tools: let an LLM agent BUILD and EDIT a Game Pack through validated calls.
// Tool results are plain JSON; errors are returned (not thrown) so the model can self-correct.
// ============================================================================
export const TOOL_DEFS = [
  { name: 'describe_pack', description: 'Summarize the current pack: map size, legend, entities, quests.', input_schema: { type: 'object', properties: {} } },
  { name: 'search_assets', description: "Check whether an asset exists. 'by' tells which provider serves it; by='placeholder' means NOT available (supply an inline 'shape' instead).", input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'paint_tiles', description: 'Fill a rectangle of the map with a legend character.', input_schema: { type: 'object', properties: { char: { type: 'string' }, rect: { type: 'array', items: { type: 'number' }, description: '[x,y,w,h]' } }, required: ['char', 'rect'] } },
  { name: 'find_free_spot', description: 'Nearest walkable, unoccupied tile to a position.', input_schema: { type: 'object', properties: { near: { type: 'array', items: { type: 'number' } }, size: { type: 'array', items: { type: 'number' } } }, required: ['near'] } },
  { name: 'place_entity', description: 'Add an entity (player, npc, object, item, trigger). Validates bounds/overlap.', input_schema: { type: 'object', properties: { entity: { type: 'object', description: 'EntityDef JSON' } }, required: ['entity'] } },
  { name: 'add_dialogue', description: 'Add or replace a scripted dialogue tree.', input_schema: { type: 'object', properties: { id: { type: 'string' }, tree: { type: 'object' } }, required: ['id', 'tree'] } },
  { name: 'add_quest', description: 'Add a quest (objectives, prerequisites, rewards).', input_schema: { type: 'object', properties: { quest: { type: 'object' } }, required: ['quest'] } },
  { name: 'validate_pack', description: 'Run all validators and return issues.', input_schema: { type: 'object', properties: {} } },
] as const;

export class PackBuilder {
  constructor(public pack: GamePack, private resolver: AssetResolver) {}

  private occupied(): Set<string> {
    const s = new Set<string>();
    for (const e of this.pack.entities) { const sz = e.size ?? [1, 1]; for (let y = 0; y < sz[1]; y++) for (let x = 0; x < sz[0]; x++) if (e.blocks ?? e.kind === 'object') s.add(`${e.pos[0] + x},${e.pos[1] + y}`); }
    return s;
  }
  private walk(x: number, y: number) { const m = this.pack.map; return x >= 0 && y >= 0 && x < m.width && y < m.height && !!m.legend[m.rows[y][x]]?.walkable; }

  async call(name: string, a: any): Promise<unknown> {
    try { return await this.dispatch(name, a ?? {}); } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
  }

  private async dispatch(name: string, a: any): Promise<unknown> {
    const p = this.pack;
    switch (name) {
      case 'describe_pack':
        return { title: p.meta.title, map: { w: p.map.width, h: p.map.height, legend: p.map.legend }, entities: p.entities.map((e) => ({ id: e.id, kind: e.kind, pos: e.pos })), quests: p.quests.map((q) => q.id), dialogues: Object.keys(p.dialogues) };
      case 'search_assets': { const r = await this.resolver.resolve({ ref: a.query }); return { ok: r.kind !== 'placeholder', by: r.by === 'none' ? 'placeholder' : r.by, kind: r.kind }; }
      case 'paint_tiles': {
        const [x, y, w, h] = a.rect as number[];
        if (!p.map.legend[a.char]) return { ok: false, error: `'${a.char}' not in legend: ${Object.keys(p.map.legend).join('')}` };
        for (let j = Math.max(0, y); j < Math.min(p.map.height, y + h); j++) {
          const row = p.map.rows[j].split('');
          for (let i = Math.max(0, x); i < Math.min(p.map.width, x + w); i++) row[i] = a.char;
          p.map.rows[j] = row.join('');
        }
        return { ok: true };
      }
      case 'find_free_spot': {
        const [nx, ny] = a.near as number[], [sw, sh] = (a.size as number[]) ?? [1, 1], occ = this.occupied();
        for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          let ok = true;
          for (let j = 0; j < sh && ok; j++) for (let i = 0; i < sw && ok; i++) { const x = nx + dx + i, y = ny + dy + j; ok = this.walk(x, y) && !occ.has(`${x},${y}`); }
          if (ok) return { ok: true, pos: [nx + dx, ny + dy] };
        }
        return { ok: false, error: 'no free spot nearby' };
      }
      case 'place_entity': {
        const e = a.entity as EntityDef;
        if (!e?.id || !e.kind || !Array.isArray(e.pos)) return { ok: false, error: 'entity needs id, kind, pos:[x,y]' };
        if (p.entities.some((x) => x.id === e.id)) return { ok: false, error: `id '${e.id}' already exists` };
        const occ = this.occupied(), sz = e.size ?? [1, 1], solid = e.blocks ?? e.kind === 'object';
        for (let j = 0; j < sz[1]; j++) for (let i = 0; i < sz[0]; i++) {
          const x = e.pos[0] + i, y = e.pos[1] + j;
          if (!this.walk(x, y)) return { ok: false, error: `[${x},${y}] is out of bounds or not walkable` };
          if (solid && occ.has(`${x},${y}`)) return { ok: false, error: `[${x},${y}] already occupied` };
        }
        p.entities.push(e); return { ok: true };
      }
      case 'add_dialogue': p.dialogues[a.id] = a.tree as DialogueTree; return { ok: true, issues: validatePack(p).filter((i) => i.code.startsWith('dialogue')) };
      case 'add_quest': { const q = a.quest as Quest; p.quests = p.quests.filter((x) => x.id !== q.id); p.quests.push(q); return { ok: true }; }
      case 'validate_pack': { const issues = validatePack(p); return { ok: !issues.some((i) => i.level === 'error'), issues }; }
      default: return { ok: false, error: `unknown tool '${name}'` };
    }
  }
}
