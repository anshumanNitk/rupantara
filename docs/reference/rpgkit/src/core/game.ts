import type { Action, Condition, DialogueCtx, DialogueInput, DialogueProvider, DialogueTurn, EntityDef, GamePack, Objective, Vec2 } from './types';
import { EventBus } from './events';
import { findPath, nearestFree } from './pathfinding';
import { ScriptedProvider } from '../dialogue/providers';

export interface Intent { dx: number; dy: number; interact?: boolean; moveTo?: Vec2 }

export interface RuntimeEntity {
  id: string;
  kind: EntityDef['kind'];
  def: EntityDef;
  x: number; y: number; // tile units; tile (i,j) center = (i+.5, j+.5)
  facing: Vec2;
  blocks: boolean;
  path: Vec2[];
  home: Vec2;
  wanderT: number;
  moving: boolean;
  used: boolean;
  state: Record<string, any>;
}

type QuestState = { state: 'locked' | 'active' | 'done'; progress: Record<string, boolean> };
interface ActiveDialogue { npc: EntityDef; provider: DialogueProvider; ctx: DialogueCtx; turn: DialogueTurn }

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Game: renderer-independent runtime. Feed it `update(dt, intent)`; listen to `events`.
 * Events: focus, say, inventory, flag, toggle, quests, dialogue, busy, interact, error, + any 'emit' action.
 */
export class Game {
  events = new EventBus();
  flags: Record<string, unknown> = {};
  inventory: Record<string, number> = {};
  entities = new Map<string, RuntimeEntity>();
  quests = new Map<string, QuestState>();
  player!: RuntimeEntity;
  focus: string | null = null;
  dialogue: ActiveDialogue | null = null;
  busy = false;
  time = 0;
  speed = 4; // tiles / second

  private W: number; private H: number;
  private walkable: Uint8Array;
  private blocked: Uint8Array;
  private rand: () => number;
  private talked = new Set<string>();
  private interacted = new Set<string>();
  private questSig = '';

  constructor(public pack: GamePack, opts: { providers?: DialogueProvider[] } = {}) {
    this.providers = opts.providers ?? [new ScriptedProvider()];
    this.W = pack.map.width; this.H = pack.map.height;
    this.rand = rng(pack.meta.seed ?? 1);
    this.walkable = new Uint8Array(this.W * this.H);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) this.walkable[y * this.W + x] = pack.map.legend[pack.map.rows[y]?.[x]]?.walkable ? 1 : 0;

    for (const d of pack.entities) {
      const s = d.size ?? [1, 1];
      const e: RuntimeEntity = {
        id: d.id, kind: d.kind, def: d, x: d.pos[0] + s[0] / 2, y: d.pos[1] + s[1] / 2, facing: [0, 1],
        blocks: d.blocks ?? d.kind === 'object', path: [], home: [...d.pos], wanderT: this.rand() * 3, moving: false, used: false, state: { ...d.state },
      };
      this.entities.set(d.id, e);
      if (d.kind === 'player') this.player = e;
    }
    if (!this.player) throw new Error('Game Pack has no player entity');
    this.blocked = new Uint8Array(this.W * this.H);
    this.rebuildBlocked();
    for (const q of pack.quests) this.quests.set(q.id, { state: 'locked', progress: {} });
    this.unlockQuests();
    this.evaluateQuests();
  }
  private providers: DialogueProvider[];

  // ---------------------------------------------------------------- world queries
  isBlockedTile(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return true;
    const i = y * this.W + x;
    return !this.walkable[i] || !!this.blocked[i];
  }

  private rebuildBlocked() {
    this.blocked.fill(0);
    for (const e of this.entities.values()) {
      if (!e.blocks || e.state.hidden || e.kind === 'npc' || e.kind === 'player') continue;
      const s = e.def.size ?? [1, 1];
      for (let y = e.def.pos[1]; y < e.def.pos[1] + s[1]; y++)
        for (let x = e.def.pos[0]; x < e.def.pos[0] + s[0]; x++)
          if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.blocked[y * this.W + x] = 1;
    }
  }

  // ---------------------------------------------------------------- main loop
  update(dt: number, it: Intent = { dx: 0, dy: 0 }) {
    dt = Math.min(dt, 0.1); this.time += dt;
    const p = this.player;
    p.moving = false;
    if (!this.dialogue && !this.busy) {
      if (it.moveTo) this.moveTo(it.moveTo);
      const mag = Math.hypot(it.dx, it.dy);
      if (mag > 0.01) {
        p.path = [];
        const k = (this.speed * dt) / Math.max(1, mag);
        this.tryMove(p, it.dx * k, it.dy * k);
        p.facing = [it.dx / mag, it.dy / mag]; p.moving = true;
      } else if (p.path.length) { this.follow(p, this.speed, dt); p.moving = true; }
    }
    this.updateNpcs(dt);
    this.updateFocus();
    if (it.interact && this.focus && !this.dialogue && !this.busy) void this.interact(this.focus);
    this.updateTriggers();
    this.evaluateQuests();
  }

  moveTo(tile: Vec2) {
    const p = this.player, start: Vec2 = [Math.floor(p.x), Math.floor(p.y)];
    const goal = nearestFree(this.W, this.H, (x, y) => this.isBlockedTile(x, y), tile);
    p.path = (goal && findPath(this.W, this.H, (x, y) => this.isBlockedTile(x, y), start, goal)) || [];
  }

  private follow(e: RuntimeEntity, speed: number, dt: number) {
    const t = e.path[0]; if (!t) return;
    const tx = t[0] + 0.5, ty = t[1] + 0.5, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), step = speed * dt;
    if (d <= step) { e.x = tx; e.y = ty; e.path.shift(); } else { e.x += (dx / d) * step; e.y += (dy / d) * step; }
    if (d > 1e-6) e.facing = [dx / d, dy / d];
  }

  private hitsBlock(x: number, y: number, r: number) {
    for (const [cx, cy] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]])
      if (this.isBlockedTile(Math.floor(cx), Math.floor(cy))) return true;
    return false;
  }

  private npcBlocks(nx: number, ny: number, ox: number, oy: number, r: number) {
    for (const n of this.entities.values()) {
      if (n.kind !== 'npc' || n.state.hidden) continue;
      const near = (x: number, y: number) => Math.abs(x - n.x) < r + 0.3 && Math.abs(y - n.y) < r + 0.3;
      if (near(nx, ny) && Math.hypot(nx - n.x, ny - n.y) < Math.hypot(ox - n.x, oy - n.y)) return true; // only block moving closer
    }
    return false;
  }

  private tryMove(e: RuntimeEntity, dx: number, dy: number, r = 0.28) {
    const nx = e.x + dx;
    if (!this.hitsBlock(nx, e.y, r) && !this.npcBlocks(nx, e.y, e.x, e.y, r)) e.x = nx;
    const ny = e.y + dy;
    if (!this.hitsBlock(e.x, ny, r) && !this.npcBlocks(e.x, ny, e.x, e.y, r)) e.y = ny;
  }

  private updateNpcs(dt: number) {
    for (const n of this.entities.values()) {
      if (n.kind !== 'npc') continue;
      const talking = this.dialogue?.npc.id === n.id;
      const w = n.def.npc?.wander;
      if (w && !talking && !n.state.hidden) {
        n.wanderT -= dt;
        if (!n.path.length && n.wanderT <= 0) {
          const g: Vec2 = [Math.round(n.home[0] + (this.rand() * 2 - 1) * w.radius), Math.round(n.home[1] + (this.rand() * 2 - 1) * w.radius)];
          n.path = findPath(this.W, this.H, (x, y) => this.isBlockedTile(x, y), [Math.floor(n.x), Math.floor(n.y)], g) ?? [];
          n.wanderT = 2 + this.rand() * 4;
        }
        if (n.path.length) { this.follow(n, w.speed ?? 1.2, dt); n.moving = true; } else n.moving = false;
      } else n.moving = false;
    }
  }

  private distToEntity(px: number, py: number, e: RuntimeEntity) {
    let x0: number, y0: number, x1: number, y1: number;
    if (e.kind === 'npc') { x0 = e.x - 0.3; x1 = e.x + 0.3; y0 = e.y - 0.3; y1 = e.y + 0.3; }
    else { const s = e.def.size ?? [1, 1]; x0 = e.def.pos[0]; y0 = e.def.pos[1]; x1 = x0 + s[0]; y1 = y0 + s[1]; }
    return Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));
  }

  focusLabel(id: string | null) {
    const e = id ? this.entities.get(id) : undefined;
    return e ? e.def.interact?.label ?? (e.def.npc ? 'Talk' : 'Use') : null;
  }

  private updateFocus() {
    const p = this.player; let best: string | null = null, bd = 0.9;
    for (const e of this.entities.values()) {
      if (e === p || e.state.hidden || (!e.def.interact && !e.def.npc)) continue;
      const d = this.distToEntity(p.x, p.y, e);
      if (d < bd) { bd = d; best = e.id; }
    }
    if (best !== this.focus) { this.focus = best; this.events.emit('focus', { id: best, label: this.focusLabel(best) }); }
  }

  private updateTriggers() {
    for (const e of this.entities.values()) {
      const t = e.def.trigger;
      if (!t || e.used) continue;
      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) <= t.radius) {
        if (t.once !== false) e.used = true;
        this.run(t.actions, e);
      }
    }
  }

  // ---------------------------------------------------------------- interaction
  async interact(id: string) {
    const e = this.entities.get(id); if (!e) return;
    this.interacted.add(id); this.events.emit('interact', { id });
    if (e.def.npc) { await this.openDialogue(e.def); return; }
    const it = e.def.interact; if (!it) return;
    if (it.once && e.used) return this.run([{ do: 'say', text: it.usedText ?? 'Nothing more to do here.' }], e);
    if (!this.check(it.requires)) return this.run([{ do: 'say', text: it.failText ?? "You can't do that yet." }], e);
    e.used = true;
    this.run(it.actions, e);
    this.evaluateQuests();
  }

  check(cs?: Condition[]): boolean {
    return !cs || cs.every((c) => {
      if ('flag' in c) return c.equals === undefined ? !!this.flags[c.flag] : this.flags[c.flag] === c.equals;
      if ('has' in c) return (this.inventory[c.has] ?? 0) >= (c.n ?? 1);
      if ('quest' in c) return this.quests.get(c.quest)?.state === (c.state ?? 'done');
      return true;
    });
  }

  run(actions?: Action[], src?: RuntimeEntity) { for (const a of actions ?? []) this.exec(a, src); }

  private exec(a: Action, src?: RuntimeEntity) {
    switch (a.do) {
      case 'say': this.events.emit('say', { text: a.text, speaker: src?.def.name }); break;
      case 'dialogue': void this.openDialogue(src?.def ?? { id: 'narrator', kind: 'object', pos: [0, 0], name: 'Narrator' }, a.id); break;
      case 'give': this.inventory[a.item] = (this.inventory[a.item] ?? 0) + (a.n ?? 1); this.events.emit('inventory', { item: a.item }); break;
      case 'take': this.inventory[a.item] = Math.max(0, (this.inventory[a.item] ?? 0) - (a.n ?? 1)); this.events.emit('inventory', { item: a.item }); break;
      case 'flag': this.flags[a.key] = a.value ?? true; this.events.emit('flag', { key: a.key }); break;
      case 'toggle': {
        const t = a.entity ? this.entities.get(a.entity) : src;
        if (t) { t.state.hidden = !t.state.hidden; this.rebuildBlocked(); this.events.emit('toggle', { id: t.id, hidden: t.state.hidden }); }
        break;
      }
      case 'teleport': this.player.x = a.to[0] + 0.5; this.player.y = a.to[1] + 0.5; this.player.path = []; break;
      case 'emit': this.events.emit(a.event, a.data); break;
    }
  }

  // ---------------------------------------------------------------- dialogue
  private makeCtx(npc: EntityDef, treeId?: string): DialogueCtx {
    return {
      npc, pack: this.pack, treeId, flags: this.flags, inventory: this.inventory, history: [], mem: {},
      activeObjectives: this.activeObjectiveTexts(),
      check: (c) => this.check(c), run: (a) => this.run(a, this.entities.get(npc.id)),
    };
  }

  private setBusy(b: boolean) { this.busy = b; this.events.emit('busy', b); }

  async openDialogue(npc: EntityDef, treeId?: string) {
    const ctx = this.makeCtx(npc, treeId);
    this.setBusy(true);
    try {
      for (const p of this.providers.filter((p) => p.canHandle(npc, ctx))) {
        try {
          const turn = await p.respond(ctx, { type: 'start' });
          this.talked.add(npc.id); this.events.emit('talk', { id: npc.id });
          this.dialogue = { npc, provider: p, ctx, turn };
          return this.afterTurn(turn);
        } catch (err) { this.events.emit('error', { where: 'dialogue', provider: p.name, err }); } // fall through to next provider
      }
      this.run([{ do: 'say', text: '...' }]);
    } finally { this.setBusy(false); }
  }

  private afterTurn(turn: DialogueTurn) {
    this.run(turn.actions);
    if (turn.silent) return this.endDialogue();
    this.events.emit('dialogue', { open: true, turn, npc: this.dialogue?.npc });
  }

  async dialogueInput(input: DialogueInput) {
    const d = this.dialogue; if (!d || this.busy) return;
    if (d.turn.end && input.type !== 'text') return this.endDialogue();
    this.setBusy(true);
    try {
      d.turn = await d.provider.respond(d.ctx, input);
      this.afterTurn(d.turn);
    } catch (err) {
      this.events.emit('error', { where: 'dialogue', provider: d.provider.name, err });
      d.turn = { speaker: d.npc.name ?? d.npc.id, text: '(They seem lost in thought.)', end: true };
      this.events.emit('dialogue', { open: true, turn: d.turn, npc: d.npc });
    } finally { this.setBusy(false); }
  }

  endDialogue() { this.dialogue = null; this.events.emit('dialogue', { open: false }); }

  // ---------------------------------------------------------------- quests
  private unlockQuests() {
    for (const q of this.pack.quests) {
      const s = this.quests.get(q.id)!;
      if (s.state === 'locked' && (q.prerequisites ?? []).every((id) => this.quests.get(id)?.state === 'done')) s.state = 'active';
    }
  }

  private objectiveDone(o: Objective): boolean {
    switch (o.type) {
      case 'talk': return this.talked.has(o.target ?? '');
      case 'interact': return this.interacted.has(o.target ?? '');
      case 'collect': return (this.inventory[o.target ?? ''] ?? 0) >= (o.n ?? 1);
      case 'flag': return !!this.flags[o.target ?? ''];
      case 'reach': return !!o.at && Math.hypot(this.player.x - (o.at[0] + 0.5), this.player.y - (o.at[1] + 0.5)) <= (o.radius ?? 1);
    }
  }

  evaluateQuests() {
    for (let changed = true; changed; ) {
      changed = false;
      for (const q of this.pack.quests) {
        const s = this.quests.get(q.id)!;
        if (s.state !== 'active') continue;
        for (const o of q.objectives) s.progress[o.id] = s.progress[o.id] || this.objectiveDone(o); // progress is sticky
        if (q.objectives.every((o) => s.progress[o.id])) {
          s.state = 'done'; this.run(q.rewards); this.unlockQuests(); changed = true;
          this.events.emit('questDone', { id: q.id, title: q.title });
        }
      }
    }
    const sig = JSON.stringify([...this.quests.values()]);
    if (sig !== this.questSig) { this.questSig = sig; this.events.emit('quests', this.questLog()); }
  }

  questLog() {
    return this.pack.quests.map((q) => {
      const s = this.quests.get(q.id)!;
      return { id: q.id, title: q.title, state: s.state, learningGoal: q.learningGoal, objectives: q.objectives.map((o) => ({ text: o.text, done: !!s.progress[o.id] })) };
    });
  }

  private activeObjectiveTexts() {
    return this.pack.quests.filter((q) => this.quests.get(q.id)?.state === 'active').flatMap((q) => q.objectives.filter((o) => !this.quests.get(q.id)!.progress[o.id]).map((o) => o.text));
  }

  itemName(id: string) { return this.pack.items?.[id]?.name ?? id; }

  // ---------------------------------------------------------------- save / load
  snapshot() {
    return {
      flags: this.flags, inventory: this.inventory, talked: [...this.talked], interacted: [...this.interacted],
      quests: [...this.quests.entries()], player: [this.player.x, this.player.y] as Vec2,
      entities: Object.fromEntries([...this.entities.values()].map((e) => [e.id, { used: e.used, state: e.state }])),
    };
  }

  restore(s: ReturnType<Game['snapshot']>) {
    this.flags = s.flags; this.inventory = s.inventory; this.talked = new Set(s.talked); this.interacted = new Set(s.interacted);
    this.quests = new Map(s.quests); [this.player.x, this.player.y] = s.player;
    for (const [id, v] of Object.entries(s.entities)) { const e = this.entities.get(id); if (e) { e.used = v.used; e.state = v.state; } }
    this.rebuildBlocked(); this.evaluateQuests();
    for (const e of this.entities.values()) this.events.emit('toggle', { id: e.id, hidden: !!e.state.hidden });
  }
}
