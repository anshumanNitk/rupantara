import type { Game } from '../core/game';

// ---------------------------------------------------------------- keyboard (also drives dialogue keys)
export class KeyboardInput {
  private held = new Set<string>();
  private interactQueued = false;
  constructor(private game: Game) {
    addEventListener('keydown', this.down); addEventListener('keyup', this.up); addEventListener('blur', this.blur);
  }
  axes() {
    const h = this.held, any = (...k: string[]) => k.some((x) => h.has(x));
    return { x: (any('d', 'arrowright') ? 1 : 0) - (any('a', 'arrowleft') ? 1 : 0), y: (any('w', 'arrowup') ? 1 : 0) - (any('s', 'arrowdown') ? 1 : 0) };
  }
  consumeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; }
  private blur = () => this.held.clear();
  private up = (e: KeyboardEvent) => this.held.delete(e.key.toLowerCase());
  private down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Escape') this.game.endDialogue(); return; } // typing to an NPC
    const k = e.key.toLowerCase(), g = this.game;
    if (g.dialogue) {
      e.preventDefault();
      if (/^[1-9]$/.test(k)) void g.dialogueInput({ type: 'choice', index: Number(k) - 1 });
      else if (k === 'e' || k === ' ' || k === 'enter') { if (!g.dialogue.turn.choices?.length || g.dialogue.turn.end) void g.dialogueInput({ type: 'next' }); }
      else if (k === 'escape') g.endDialogue();
      return;
    }
    if (k === 'e' || k === ' ') { this.interactQueued = true; e.preventDefault(); }
    this.held.add(k);
  };
  dispose() { removeEventListener('keydown', this.down); removeEventListener('keyup', this.up); removeEventListener('blur', this.blur); }
}

// ---------------------------------------------------------------- HUD (plain DOM; uses textContent so LLM text can't inject HTML)
const CSS = `
.rk{position:absolute;inset:0;pointer-events:none;font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#fff}
.rk>*{pointer-events:auto}.rk .panel{background:rgba(15,18,30,.82);border:2px solid #e9edf7;border-radius:6px;padding:8px 12px}
.rk .tl{position:absolute;top:10px;left:10px;max-width:300px;max-height:55%;overflow:auto}.rk .tr{position:absolute;top:10px;right:10px}
.rk .prompt{position:absolute;bottom:22%;left:50%;transform:translateX(-50%);display:none}
.rk .toast{position:absolute;top:18%;left:50%;transform:translateX(-50%);display:none;max-width:70%}
.rk .dlg{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);width:min(680px,94%);display:none}
.rk .dlg .who{color:#ffd166;font-weight:700;margin-bottom:4px}.rk .dlg button{display:block;width:100%;text-align:left;margin:4px 0 0;padding:6px 8px;background:#1f2a44;color:#fff;border:1px solid #6b7aa6;border-radius:4px;cursor:pointer;font:inherit}
.rk .dlg button:hover{background:#2c3b61}.rk .dlg input{width:100%;box-sizing:border-box;margin-top:6px;padding:6px 8px;background:#0e1424;color:#fff;border:1px solid #6b7aa6;border-radius:4px;font:inherit}
.rk .q{margin-top:6px}.rk .done{color:#7ee081;text-decoration:line-through}.rk .muted{opacity:.6}`;

export class HudUI {
  private root = document.createElement('div');
  private prompt = document.createElement('div');
  private toast = document.createElement('div');
  private dlg = document.createElement('div');
  private ql = document.createElement('div');
  private inv = document.createElement('div');
  private toastT = 0;

  constructor(private game: Game, container: HTMLElement) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root.className = 'rk';
    this.ql.className = 'panel tl'; this.inv.className = 'panel tr'; this.prompt.className = 'panel prompt'; this.toast.className = 'panel toast'; this.dlg.className = 'panel dlg';
    this.root.append(this.ql, this.inv, this.prompt, this.toast, this.dlg);
    container.style.position = container.style.position || 'relative'; container.appendChild(this.root);
    const ev = game.events;
    ev.on('focus', ({ label }) => { this.prompt.style.display = label && !game.dialogue ? 'block' : 'none'; this.prompt.textContent = `[E] ${label}`; });
    ev.on('say', ({ text, speaker }) => this.say(speaker ? `${speaker}: ${text}` : text));
    ev.on('dialogue', () => this.renderDialogue());
    ev.on('busy', () => this.renderDialogue());
    ev.on('quests', () => this.renderQuests());
    ev.on('inventory', () => this.renderInv());
    ev.on('questDone', ({ title }) => this.say(`Quest complete: ${title}`));
    this.renderQuests(); this.renderInv();
  }

  private say(t: string) {
    this.toast.textContent = t; this.toast.style.display = 'block';
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => (this.toast.style.display = 'none'), 3200);
  }

  private renderQuests() {
    this.ql.replaceChildren();
    const h = document.createElement('b'); h.textContent = 'Quests'; this.ql.append(h);
    for (const q of this.game.questLog().filter((q) => q.state !== 'locked')) {
      const d = document.createElement('div'); d.className = 'q' + (q.state === 'done' ? ' muted' : '');
      const t = document.createElement('div'); t.textContent = (q.state === 'done' ? '✓ ' : '• ') + q.title; d.append(t);
      if (q.state === 'active') for (const o of q.objectives) { const l = document.createElement('div'); l.className = o.done ? 'done' : ''; l.textContent = '   - ' + o.text; d.append(l); }
      this.ql.append(d);
    }
  }

  private renderInv() {
    const items = Object.entries(this.game.inventory).filter(([, n]) => n > 0);
    this.inv.textContent = items.length ? items.map(([id, n]) => `${this.game.itemName(id)} x${n}`).join('  ') : 'Inventory: empty';
  }

  private renderDialogue() {
    const g = this.game, d = g.dialogue;
    if (!d) { this.dlg.style.display = 'none'; this.dlg.replaceChildren(); this.prompt.style.display = g.focus ? 'block' : 'none'; return; }
    this.prompt.style.display = 'none'; this.dlg.style.display = 'block'; this.dlg.replaceChildren();
    const t = d.turn;
    const who = document.createElement('div'); who.className = 'who'; who.textContent = t.speaker;
    const txt = document.createElement('div'); txt.textContent = g.busy ? '…' : t.text;
    this.dlg.append(who, txt);
    const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; this.dlg.append(b); };
    if (!g.busy) {
      (t.choices ?? []).forEach((c, i) => btn(`${i + 1}. ${c}`, () => void g.dialogueInput(t.end ? { type: 'next' } : { type: 'choice', index: i })));
      if (!t.choices?.length || t.end) btn(t.end ? 'Close [E]' : 'Continue [E]', () => void g.dialogueInput({ type: 'next' }));
      if (t.allowText && !t.end) {
        const inp = document.createElement('input'); inp.placeholder = 'Say something… (Enter to send, Esc to leave)';
        inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { const v = inp.value; inp.value = ''; void g.dialogueInput({ type: 'text', text: v }); } };
        this.dlg.append(inp); setTimeout(() => inp.focus(), 0);
      }
    }
  }
}
