import type { Action, EntityDef, GamePack } from './types';

export interface Issue { level: 'error' | 'warn'; code: string; msg: string }

function* allActions(p: GamePack): Generator<{ a: Action; where: string }> {
  for (const e of p.entities) {
    for (const a of e.interact?.actions ?? []) yield { a, where: `entity ${e.id}` };
    for (const a of e.trigger?.actions ?? []) yield { a, where: `trigger ${e.id}` };
  }
  for (const [id, t] of Object.entries(p.dialogues))
    for (const [k, n] of Object.entries(t.nodes)) {
      for (const a of n.actions ?? []) yield { a, where: `dialogue ${id}.${k}` };
      for (const c of n.choices ?? []) for (const a of c.actions ?? []) yield { a, where: `dialogue ${id}.${k}` };
    }
  for (const q of p.quests) for (const a of q.rewards ?? []) yield { a, where: `quest ${q.id}` };
}

/** Schema + graph + spatial + gameplay checks. Run before loading any AI-generated pack. */
export function validatePack(p: GamePack): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, msg: string) => out.push({ level: 'error', code, msg });
  const warn = (code: string, msg: string) => out.push({ level: 'warn', code, msg });
  const { width: W, height: H, rows, legend } = p.map;

  // ---- map
  if (rows.length !== H) err('map.height', `rows=${rows.length}, expected ${H}`);
  rows.forEach((r, y) => {
    if (r.length !== W) err('map.width', `row ${y} has ${r.length} chars, expected ${W}`);
    for (const ch of new Set(r)) if (!legend[ch]) err('map.legend', `row ${y}: '${ch}' missing from legend`);
  });
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !!legend[rows[y]?.[x]]?.walkable;

  // ---- entities
  const ids = new Set<string>(); let players = 0;
  const blocksDefault = (e: EntityDef) => e.blocks ?? e.kind === 'object';
  const toggleable = (e: EntityDef) => !!e.interact?.actions.some((a) => a.do === 'toggle');
  const solid = new Map<string, string>(); // tile -> entity id (permanent blockers)
  const gates = new Set<string>(); // tiles blocked only until toggled
  const fp = (e: EntityDef) => { const s = e.size ?? [1, 1], t: [number, number][] = []; for (let y = 0; y < s[1]; y++) for (let x = 0; x < s[0]; x++) t.push([e.pos[0] + x, e.pos[1] + y]); return t; };

  for (const e of p.entities) {
    if (ids.has(e.id)) err('entity.dup', `duplicate id '${e.id}'`); ids.add(e.id);
    if (e.kind === 'player') players++;
    for (const [x, y] of fp(e)) {
      if (x < 0 || y < 0 || x >= W || y >= H) { err('entity.bounds', `'${e.id}' outside map at [${x},${y}]`); continue; }
      if (!walk(x, y) && e.kind !== 'trigger') (['player', 'npc', 'item'].includes(e.kind) ? err : warn)('entity.tile', `'${e.id}' on non-walkable tile [${x},${y}]`);
      if (blocksDefault(e) && e.kind !== 'npc') {
        const k = `${x},${y}`;
        if (solid.has(k) || gates.has(k)) err('entity.overlap', `'${e.id}' overlaps blocker '${solid.get(k)}' at [${x},${y}]`);
        (toggleable(e) ? gates : new Set<string>()).add(k);
        if (!toggleable(e)) solid.set(k, e.id);
      }
    }
  }
  if (players !== 1) err('player.count', `expected exactly 1 player, found ${players}`);

  // ---- references
  for (const e of p.entities) if (e.npc?.dialogueId && !p.dialogues[e.npc.dialogueId]) err('ref.dialogue', `'${e.id}' -> missing dialogue '${e.npc.dialogueId}'`);
  for (const { a, where } of allActions(p)) {
    if (a.do === 'dialogue' && !p.dialogues[a.id]) err('ref.dialogue', `${where} -> missing dialogue '${a.id}'`);
    if ((a.do === 'give' || a.do === 'take') && !p.items?.[a.item]) warn('ref.item', `${where} -> item '${a.item}' not in pack.items`);
    if (a.do === 'toggle' && a.entity && !ids.has(a.entity)) err('ref.entity', `${where} -> missing entity '${a.entity}'`);
  }
  for (const [id, t] of Object.entries(p.dialogues)) {
    if (!t.nodes[t.start]) err('dialogue.start', `${id}: start '${t.start}' missing`);
    for (const [k, n] of Object.entries(t.nodes)) {
      if (n.next && !t.nodes[n.next]) err('dialogue.next', `${id}.${k} -> '${n.next}' missing`);
      for (const c of n.choices ?? []) if (c.next && !t.nodes[c.next]) err('dialogue.next', `${id}.${k} choice -> '${c.next}' missing`);
    }
  }

  // ---- quests
  const qids = new Set(p.quests.map((q) => q.id));
  for (const q of p.quests) {
    for (const r of q.prerequisites ?? []) if (!qids.has(r)) err('quest.prereq', `${q.id} -> missing prerequisite '${r}'`);
    for (const o of q.objectives) {
      if ((o.type === 'talk' || o.type === 'interact') && !ids.has(o.target ?? '')) err('quest.target', `${q.id}.${o.id} -> missing entity '${o.target}'`);
      if (o.type === 'collect' && !p.items?.[o.target ?? '']) err('quest.target', `${q.id}.${o.id} -> unknown item '${o.target}'`);
      if (o.type === 'reach' && (!o.at || o.at[0] < 0 || o.at[1] < 0 || o.at[0] >= W || o.at[1] >= H)) err('quest.target', `${q.id}.${o.id} -> bad 'at'`);
    }
  }
  const state = new Map<string, number>(); // 0 new, 1 visiting, 2 done
  const dfs = (id: string, path: string[]) => {
    if (state.get(id) === 2) return; if (state.get(id) === 1) { err('quest.cycle', `cycle: ${[...path, id].join(' -> ')}`); return; }
    state.set(id, 1);
    for (const r of p.quests.find((q) => q.id === id)?.prerequisites ?? []) if (qids.has(r)) dfs(r, [...path, id]);
    state.set(id, 2);
  };
  qids.forEach((id) => dfs(id, []));

  // ---- gameplay: items needed by 'has' conditions / collect objectives must be obtainable
  const givable = new Set<string>();
  for (const { a } of allActions(p)) if (a.do === 'give') givable.add(a.item);
  for (const q of p.quests) for (const o of q.objectives) if (o.type === 'collect' && o.target && !givable.has(o.target)) err('gameplay.item', `${q.id}.${o.id}: '${o.target}' is never given by anything`);
  for (const e of p.entities) for (const c of e.interact?.requires ?? []) if ('has' in c && !givable.has(c.has)) err('gameplay.item', `'${e.id}' requires '${c.has}' which is never given`);

  // ---- spatial: flood fill from spawn (toggleable blockers count as passable)
  const player = p.entities.find((e) => e.kind === 'player');
  if (player && walk(...player.pos)) {
    const blockedTiles = new Set(solid.keys());
    const seen = new Set<string>([`${player.pos[0]},${player.pos[1]}`]); const q: [number, number][] = [[...player.pos]];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!seen.has(k) && walk(nx, ny) && !blockedTiles.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    for (const e of p.entities) {
      if (!['npc', 'object', 'item'].includes(e.kind) || (!e.interact && !e.npc)) continue;
      const reach = fp(e).some(([x, y]) => seen.has(`${x},${y}`) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`)));
      if (!reach) err('reach.unreachable', `'${e.id}' cannot be reached from the player spawn`);
    }
  }
  return out;
}
