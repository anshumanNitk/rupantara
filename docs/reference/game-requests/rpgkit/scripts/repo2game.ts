// Usage: npx tsx scripts/repo2game.ts <repoDir> [--out pack.json] [--html game.html] [--seed 1] [--no-play]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyzeRepo, compileRepoPack, playthrough } from '../src/pipeline/index';

const a = process.argv.slice(2);
const dir = a.find((x) => !x.startsWith('--')); if (!dir) { console.error('usage: repo2game <repoDir> [--out pack.json] [--html game.html] [--seed N] [--no-play]'); process.exit(1); }
const opt = (k: string) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const out = opt('--out') ?? 'pack.json', seed = Number(opt('--seed') ?? 1);

const t0 = Date.now();
const g = analyzeRepo(dir);
console.log(`Analyzed "${g.name}": ${Object.keys(g.files).length} files, ${g.order.length} modules, langs ${JSON.stringify(g.languages)}, entry=${g.entry}`);
for (const id of g.order) { const m = g.modules[id]; console.log(`  L${m.layer} ${m.name.padEnd(18)} ${String(m.files.length).padStart(3)} files ${String(m.loc).padStart(6)} loc  deps: ${m.deps.map((d) => g.modules[d].name).join(', ') || '-'}`); }
const pack = await compileRepoPack(g, { seed });
fs.writeFileSync(out, JSON.stringify(pack));
console.log(`Pack: ${pack.map.width}x${pack.map.height} map, ${pack.entities.length} entities, ${pack.quests.length} quests -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
if (!a.includes('--no-play')) {
  const r = await playthrough(pack);
  console.log(`Playtest: ${r.ok ? 'COMPLETED all quests' : 'FAILED: ' + r.stuck} in ${r.frames} frames (${(r.frames / 60 / 60).toFixed(1)} sim-min)`);
  if (!r.ok) console.log(r.quests);
}
const html = opt('--html');
if (html) execFileSync('node', ['scripts/build-demo.mjs', out, html], { stdio: 'inherit' });
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
