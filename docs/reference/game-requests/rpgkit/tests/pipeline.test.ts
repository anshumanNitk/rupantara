import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeRepo, buildGraph, compileRepoPack, layoutRepo, playthrough, type RawFile } from '../src/pipeline/index';
import { validatePack } from '../src/core/validate';

const f = (id: string, imports: string[] = [], loc = 50): RawFile => ({ id, lang: 'ts', loc, symbols: ['a', 'b'], imports, summary: `${id} summary` });

/** a 5-module layered repo with one cycle (b <-> c) */
const synthetic = () => buildGraph([
  f('src/util/a.ts'), f('src/util/b.ts', ['src/util/a.ts']),
  f('src/db/x.ts', ['src/util/a.ts']), f('src/db/y.ts', ['src/db/x.ts']),
  f('src/net/c.ts', ['src/util/b.ts']), f('src/net/d.ts', ['src/net/c.ts', 'src/db/y.ts']),
  f('src/app/main.ts', ['src/net/d.ts', 'src/db/x.ts']), f('src/app/ui.ts', ['src/app/main.ts']),
  { ...f('tests/t.test.ts', ['src/app/main.ts']), isTest: true },
], { name: 'synth' });

test('graph: modules, layers, entry; tests excluded; cycles never create unsatisfiable prerequisites', () => {
  const g = synthetic();
  assert.equal(g.order.length, 4);
  const L = Object.fromEntries(Object.values(g.modules).map((m) => [m.name, m.layer]));
  assert.deepEqual(L, { util: 0, db: 1, net: 2, app: 3 });
  assert.equal(g.entry, 'src/app/main.ts');
  assert.ok(!('tests/t.test.ts' in g.files));
  for (const m of Object.values(g.modules)) for (const d of m.preDeps) assert.ok(g.modules[d].layer < m.layer);

  const cyc = buildGraph([f('a/1.ts', ['b/1.ts']), f('b/1.ts', ['a/1.ts']), f('c/1.ts', ['a/1.ts']), f('d/1.ts', ['c/1.ts']), f('d/2.ts')], { name: 'cyc' });
  const [a, b] = ['a', 'b'].map((n) => Object.values(cyc.modules).find((m) => m.name === n)!);
  assert.equal(a.layer, b.layer, 'cycle members share a layer'); assert.equal(a.preDeps.length + b.preDeps.length, 0);
});

test('layout: districts do not overlap, roads connect everything, spawn is on land, deterministic per seed', () => {
  const g = synthetic(), L = layoutRepo(g, 7), L2 = layoutRepo(g, 7), L3 = layoutRepo(g, 8);
  assert.deepEqual(L.rows, L2.rows); assert.notDeepEqual(L.rows, L3.rows, 'seed changes decor');
  const ds = Object.values(L.districts);
  for (const a of ds) for (const b of ds) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id}/${b.id} overlap`);
  assert.ok(L.legend[L.rows[L.spawn[1]][L.spawn[0]]].walkable);
  assert.equal(new Set(L.rows.map((r) => r.length)).size, 1);
});

test('compile: valid pack, grounded quiz, quest DAG mirrors the dependency layers, bot completes it', async () => {
  const g = synthetic(), pack = await compileRepoPack(g, { seed: 3 });
  assert.deepEqual(validatePack(pack).filter((i) => i.level === 'error'), []);
  // quest prerequisites == module preDeps
  for (const m of Object.values(g.modules)) assert.deepEqual(pack.quests.find((q) => q.id === `q_${m.id}`)!.prerequisites, m.preDeps.map((d) => `q_${d}`));
  // quiz answers are verifiable against the graph: exactly one correct choice and it is a real dependency
  const net = Object.values(g.modules).find((m) => m.name === 'net')!;
  const q = pack.dialogues[`dlg_${net.id}`].nodes.ready;
  const right = q.choices!.filter((c) => c.next === 'right');
  assert.equal(right.length, 1);
  assert.ok(net.deps.map((d) => g.modules[d].name).includes(right[0].text));
  const r = await playthrough(pack);
  assert.ok(r.ok, JSON.stringify(r.stuck ?? r.quests));
  assert.ok(Object.values(r.quests).every((s) => s === 'done'));
});

test('compile: deterministic, and polish() may reword flavour text but never changes logic', async () => {
  const g = synthetic();
  const a = await compileRepoPack(g, { seed: 5 }), b = await compileRepoPack(g, { seed: 5 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const polished = await compileRepoPack(g, { seed: 5, polish: async (_k, t) => `✨ ${t}` });
  assert.notEqual(JSON.stringify(polished), JSON.stringify(a));
  assert.deepEqual(polished.quests, a.quests); assert.deepEqual(polished.map, a.map);
  assert.deepEqual(Object.entries(polished.dialogues).map(([k, t]) => [k, t.nodes.ready ?? null]), Object.entries(a.dialogues).map(([k, t]) => [k, t.nodes.ready ?? null]));
  assert.ok((await playthrough(polished)).ok);
});

test('analyzer: resolves JS (incl. .js->.ts, index files) and Python (relative, absolute, submodule vs symbol) imports', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-'));
  const w = (p: string, s: string) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
  // JS/TS
  w('web/src/main.ts', `/** Entry */\nimport { a } from './lib/a.js';\nimport b from "./lib";\nimport x from 'lodash';\nexport function boot() {}`);
  w('web/src/lib/a.ts', `export const a = 1;`); w('web/src/lib/index.ts', `export * from './a';`);
  // Python package
  w('py/pkg/__init__.py', `"""Package doc."""\nfrom .core import run\nVERSION = 1`);
  w('py/pkg/core.py', `"""Core logic."""\nfrom . import util\nfrom .util import helper\nimport pkg.models\nfrom . import VERSION\nimport os\ndef run(): pass`);
  w('py/pkg/util.py', `def helper(): pass`); w('py/pkg/models.py', `class Model: pass`);
  w('web/src/main.test.ts', `import './main'`); w('README.md', `# Demo\n\nA tiny demo project used for testing the analyzer end to end.\n`);
  const g = analyzeRepo(dir);
  const imp = (id: string) => [...g.files[id].imports].sort();
  assert.deepEqual(imp('web/src/main.ts'), ['web/src/lib/a.ts', 'web/src/lib/index.ts']);
  assert.deepEqual(imp('py/pkg/core.py'), ['py/pkg/__init__.py', 'py/pkg/models.py', 'py/pkg/util.py'], 'util submodule + models absolute + VERSION symbol from __init__; os ignored');
  assert.deepEqual(imp('py/pkg/__init__.py'), ['py/pkg/core.py']);
  assert.equal(g.files['web/src/main.ts'].summary, 'Entry'); assert.equal(g.files['py/pkg/core.py'].summary, 'Core logic.');
  assert.ok(g.files['py/pkg/core.py'].symbols.includes('run')); assert.ok(!('web/src/main.test.ts' in g.files));
  assert.match(g.description ?? '', /tiny demo project/);
});

test('end-to-end on a real repo (this one): analyze -> compile -> validate -> bot completes', async () => {
  const g = analyzeRepo(path.resolve('.'), { name: 'rpgkit' });
  assert.ok(g.order.length >= 4 && Object.keys(g.files).length >= 15);
  const pack = await compileRepoPack(g);
  assert.deepEqual(validatePack(pack).filter((i) => i.level === 'error'), []);
  assert.ok((await playthrough(pack)).ok);
});
