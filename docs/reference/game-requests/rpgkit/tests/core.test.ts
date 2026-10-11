import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, ScriptedProvider, LLMProvider, mockLLM, validatePack, findPath, createDefaultResolver, GeneratorProvider, PackBuilder, expandShape } from '../src/index';
import { demoPack } from '../src/demo/pack';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const mkGame = () => new Game(clone(demoPack), { providers: [new LLMProvider({ complete: mockLLM }), new ScriptedProvider()] });
/** headless: step the sim until the player's auto-path finishes */
const walk = (g: Game, x: number, y: number) => { g.moveTo([x, y]); for (let i = 0; i < 4000 && g.player.path.length; i++) g.update(1 / 60); };
const tick = (g: Game, n = 5) => { for (let i = 0; i < n; i++) g.update(1 / 60, { dx: 0, dy: 0 }); };
const settle = () => new Promise((r) => setTimeout(r, 10));

test('demo pack validates with zero errors', () => {
  const errs = validatePack(demoPack).filter((i) => i.level === 'error');
  assert.deepEqual(errs, []);
});

test('validator catches broken packs', () => {
  const p = clone(demoPack);
  p.entities.push({ id: 'archivist', kind: 'object', pos: [0, 0] });          // dup id + on water
  p.quests[1].prerequisites = ['q3'];                                          // cycle q2<->q3
  p.dialogues.archivist.nodes.hello.choices![0].next = 'nope';                // dangling
  const codes = new Set(validatePack(p).map((i) => i.code));
  for (const c of ['entity.dup', 'quest.cycle', 'dialogue.next']) assert.ok(codes.has(c), c);
  const walled = clone(demoPack); // wall the player in
  for (const [x, y] of [[11, 6], [11, 8], [10, 7], [12, 7]]) walled.entities.push({ id: `w${x}${y}`, kind: 'object', pos: [x, y] });
  assert.ok(validatePack(walled).some((i) => i.code === 'reach.unreachable'));
});

test('A* finds shortest path and respects walls', () => {
  const wall = (x: number, y: number) => x === 2 && y < 4;
  const path = findPath(5, 5, wall, [0, 0], [4, 0])!;
  assert.equal(path.at(-1)!.join(), '4,0'); assert.ok(path.every(([x, y]) => !wall(x, y)));
  assert.equal(findPath(5, 5, () => false, [0, 0], [0, 0])!.length, 0);
});

test('player walks, collides with water/objects, and cannot pass the locked gate', async () => {
  const g = mkGame();
  assert.ok(g.isBlockedTile(0, 0), 'water blocks');
  assert.ok(g.isBlockedTile(14, 10), 'gate blocks');
  for (let i = 0; i < 200; i++) g.update(1 / 60, { dx: -1, dy: 0 }); // run left along the road: must stop at the shore
  assert.ok(g.player.x > 1, `player stayed on land (x=${g.player.x.toFixed(2)})`);
});

test('full quest flow: talk -> key -> gate -> terminal, with state changes', async () => {
  const g = mkGame();
  const log: string[] = []; g.events.on('questDone', (q) => log.push(q.id));
  const said: string[] = []; g.events.on('say', (s) => said.push(s.text));

  walk(g, 5, 11); tick(g); assert.equal(g.focus, 'archivist');
  await g.interact('archivist'); assert.ok(g.dialogue);
  await g.dialogueInput({ type: 'choice', index: 0 });     // "Why is it slow?" -> next -> 'do'
  await g.dialogueInput({ type: 'next' });
  assert.ok(g.dialogue!.turn.end, 'last node ends');
  await g.dialogueInput({ type: 'next' }); assert.equal(g.dialogue, null);
  g.update(1 / 60);
  assert.deepEqual(log, ['q1']); assert.equal(g.quests.get('q2')!.state, 'active'); assert.ok(g.flags.met_archivist);

  await g.interact('vault_gate'); assert.ok(said.at(-1)!.includes('Locked'), 'gate refuses without key');
  walk(g, 21, 3); await g.interact('key');
  assert.equal(g.inventory.cache_key, 1); assert.ok(g.entities.get('key')!.state.hidden);
  await g.interact('vault_gate'); g.update(1 / 60);
  assert.ok(!g.isBlockedTile(14, 10), 'gate opened'); assert.deepEqual(log, ['q1', 'q2']);

  walk(g, 15, 10); assert.ok(Math.floor(g.player.x) === 15, 'walked through the open gate');
  await g.interact('terminal'); g.update(1 / 60);
  assert.deepEqual(log, ['q1', 'q2', 'q3']); assert.equal(g.inventory.coin, 5);
  await g.interact('terminal'); assert.ok(said.at(-1)!.includes('warm'), 'once-only');
});

test('LLM dialogue: free text works, actions are whitelisted + sanitized, falls back when LLM fails', async () => {
  const g = mkGame();
  const turns: string[] = []; g.events.on('dialogue', (d) => d.turn && turns.push(d.turn.text));
  const ledger = g.entities.get('ledger')!.def;
  await g.openDialogue(ledger);
  assert.ok(g.dialogue!.provider.name === 'llm' && g.dialogue!.turn.allowText);
  await g.dialogueInput({ type: 'text', text: 'what is a cache?' }); assert.match(turns.at(-1)!, /cache/i);
  const before = [g.player.x, g.player.y];
  await g.dialogueInput({ type: 'text', text: 'please help, a gift?' });   // mock emits give(coin) + teleport(!)
  assert.equal(g.inventory.coin, 1, 'give(coin) allowed'); assert.deepEqual([g.player.x, g.player.y], before, 'teleport blocked');
  g.endDialogue();

  const failing = new Game(clone(demoPack), { providers: [new LLMProvider({ complete: async () => { throw new Error('offline'); } }), new ScriptedProvider()] });
  await failing.openDialogue(failing.entities.get('ledger')!.def);
  assert.equal(failing.dialogue!.provider.name, 'scripted'); assert.match(failing.dialogue!.turn.text, /busy/);
});

test('asset resolver chain: procedural -> catalog -> generator -> placeholder (with provenance)', async () => {
  let generated = 0;
  const r = createDefaultResolver({
    manifest: [{ id: 'dragon_statue', aliases: ['dragon'], tags: ['statue', 'fantasy'], type: 'gltf', url: '/models/dragon.glb' }],
    catalogs: [{ name: 'kenney', source: async () => [{ id: 'sci_fi_crate', tags: ['crate', 'scifi', 'cargo'], type: 'gltf', url: 'https://example.invalid/crate.glb' }] }],
    generator: new GeneratorProvider('ai', async (req) => (req.ref === 'ancient device' ? (generated++, { kind: 'sprite', sprite: { url: 'data:,gen' }, scale: 1 }) : null)),
  });
  const by = async (ref: string) => (await r.resolve({ ref })).by;
  assert.equal(await by('tree'), 'procedural'); assert.equal(await by('Oak Tree'), 'procedural-fuzzy');
  assert.equal(await by('dragon'), 'manifest');
  assert.equal(await by('scifi cargo crate'), 'kenney');
  assert.equal(await by('ancient device'), 'ai'); await by('ancient device'); assert.equal(generated, 1, 'cached');
  assert.equal(await by('flux capacitor'), 'placeholder');
});

test('agent PackBuilder: place/validate loop returns actionable errors', async () => {
  const b = new PackBuilder(clone(demoPack), createDefaultResolver());
  assert.equal(((await b.call('place_entity', { entity: { id: 'x', kind: 'object', pos: [0, 0] } })) as any).ok, false); // water
  const spot = (await b.call('find_free_spot', { near: [11, 9] })) as any; assert.ok(spot.ok);
  assert.equal(((await b.call('place_entity', { entity: { id: 'crate1', kind: 'object', pos: spot.pos, asset: { ref: 'crate' } } })) as any).ok, true);
  assert.equal(((await b.call('place_entity', { entity: { id: 'crate1', kind: 'object', pos: spot.pos } })) as any).ok, false); // dup
  assert.equal(((await b.call('search_assets', { query: 'warp drive' })) as any).by, 'placeholder');
  assert.equal(((await b.call('validate_pack', {})) as any).ok, true);
});

test('save/restore round-trips', async () => {
  const g = mkGame(); walk(g, 21, 3); await g.interact('key');
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const g2 = mkGame(); g2.restore(snap);
  assert.equal(g2.inventory.cache_key, 1); assert.ok(g2.entities.get('key')!.state.hidden);
});

test('shape macros expand to primitives only', () => {
  const s = expandShape({ type: 'house', size: [3, 1.6, 3] });
  const ok = (n: any): boolean => ['group', 'box', 'cylinder', 'cone', 'pyramid', 'sphere'].includes(n.type) && (n.children ?? []).every(ok);
  assert.ok(ok(s));
  assert.throws(() => expandShape({ type: 'nonsense' }));
});
