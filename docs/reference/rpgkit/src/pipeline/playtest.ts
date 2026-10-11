import { Game, type RuntimeEntity } from '../core/game';
import { findPath } from '../core/pathfinding';
import type { GamePack, Vec2 } from '../core/types';
import { ScriptedProvider } from '../dialogue/providers';

// ============================================================================
// Playtest bot: plays a generated pack headlessly via the REAL runtime (movement, collisions,
// dialogue, quest engine) and reports whether every quest can be completed.
// Convention used by the compiler: flag `learned_<mid>` is set by `keeper_<mid>`.
// ============================================================================
export interface PlayResult { ok: boolean; frames: number; log: string[]; stuck?: string; quests: Record<string, string> }

export async function playthrough(pack: GamePack, maxFrames = 400_000): Promise<PlayResult> {
  const g = new Game(JSON.parse(JSON.stringify(pack)), { providers: [new ScriptedProvider()] });
  const log: string[] = []; let frames = 0;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { g.update(1 / 60); frames++; } };

  /** walk to a tile next to the entity's footprint */
  const goNear = (e: RuntimeEntity): boolean => {
    const s = e.def.size ?? [1, 1], [px, py] = e.def.pos, cands: Vec2[] = [];
    for (let y = py - 1; y <= py + s[1]; y++) for (let x = px - 1; x <= px + s[0]; x++) if ((x < px || x >= px + s[0] || y < py || y >= py + s[1]) && !g.isBlockedTile(x, y)) cands.push([x, y]);
    const me: Vec2 = [Math.floor(g.player.x), Math.floor(g.player.y)];
    let best: Vec2[] | null = null;
    for (const c of cands) { const p = findPath(pack.map.width, pack.map.height, (x, y) => g.isBlockedTile(x, y), me, c); if (p && (!best || p.length < best.length)) best = p; }
    if (!best) return false;
    g.player.path = [...best];
    for (let i = 0; i < 20_000 && g.player.path.length; i++) step();
    step(2);
    return !g.player.path.length;
  };

  const solveKeeper = async (id: string, flag: string) => {
    await g.interact(id);
    if (!g.dialogue) return;
    const hello = g.dialogue.turn.choices ?? [];
    const ready = hello.findIndex((c) => /ready/i.test(c));
    if (ready < 0) { g.endDialogue(); return; }          // prerequisites not met yet
    await g.dialogueInput({ type: 'choice', index: ready });
    for (let guard = 0; guard < 6 && g.dialogue && !g.flags[flag]; guard++) {
      const n = g.dialogue.turn.choices?.length ?? 0;
      if (!n) { await g.dialogueInput({ type: 'next' }); continue; }
      for (let i = 0; i < n && !g.flags[flag]; i++) {
        await g.dialogueInput({ type: 'choice', index: i });          // right -> flag set; wrong -> hint node
        if (!g.flags[flag] && g.dialogue) await g.dialogueInput({ type: 'next' }); // back to the question
      }
    }
    while (g.dialogue) await g.dialogueInput({ type: 'next' });
  };

  for (let round = 0; round < 200 && frames < maxFrames; round++) {
    step();
    const open = pack.quests.filter((q) => g.quests.get(q.id)?.state === 'active');
    if (!open.length) break;
    let acted = false;
    for (const q of open) {
      const s = g.quests.get(q.id)!;
      for (const o of q.objectives) {
        if (s.progress[o.id]) continue;
        if (o.type === 'interact') {
          const e = g.entities.get(o.target!)!;
          if (!goNear(e)) return { ok: false, frames, log, stuck: `cannot reach ${o.target}`, quests: status(g) };
          await g.interact(o.target!); log.push(`inspect ${o.target}`); acted = true;
        } else if (o.type === 'flag' && o.target!.startsWith('learned_')) {
          const k = g.entities.get('keeper_' + o.target!.slice(8))!;
          if (!goNear(k)) return { ok: false, frames, log, stuck: `cannot reach ${k.id}`, quests: status(g) };
          await solveKeeper(k.id, o.target!); log.push(`quiz ${k.id}`); acted = true;
        } else return { ok: false, frames, log, stuck: `bot cannot do objective ${o.id} (${o.type})`, quests: status(g) };
        g.update(1 / 60);
        if (g.quests.get(q.id)!.state === 'done') { log.push(`done ${q.id}`); break; }
      }
    }
    if (!acted) return { ok: false, frames, log, stuck: 'no progress (deadlock?)', quests: status(g) };
  }
  const quests = status(g);
  return { ok: Object.values(quests).every((s) => s === 'done'), frames, log, quests };
}
const status = (g: Game) => Object.fromEntries([...g.quests.entries()].map(([id, q]) => [id, q.state]));
