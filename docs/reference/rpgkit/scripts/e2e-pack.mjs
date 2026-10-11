// Plays the first keeper's quiz in a generated game with REAL key presses. node scripts/e2e-pack.mjs game.html prefix
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const [html, prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 700 });
const logs = []; page.on('console', (m) => m.type() !== 'log' && logs.push(m.type() + ': ' + m.text())); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + path.resolve(html)); await sleep(2000);
const first = await page.evaluate(() => game.pack.quests.find((q) => !q.prerequisites?.length).id.slice(2));
const k = await page.evaluate((id) => { const e = game.entities.get('keeper_' + id); return [Math.floor(e.x), Math.floor(e.y)]; }, first);
await page.evaluate((k) => game.moveTo([k[0] - 1, k[1]]), k); await sleep(9000);
await page.keyboard.press('e'); await sleep(500);
const st = () => page.evaluate(() => ({ focus: game.focus, open: !!game.dialogue, text: game.dialogue?.turn.text, choices: game.dialogue?.turn.choices }));
console.log('opened', await st());
const ready = (await st()).choices.findIndex((c) => /ready/i.test(c));
await page.keyboard.press(String(ready + 1)); await sleep(400);
const q = await st(); console.log('question', q);
await page.screenshot({ path: prefix + '_quiz.png' });
const learned = () => page.evaluate((id) => !!game.flags['learned_' + id], first);
for (let i = 1; i <= q.choices.length && !(await learned()); i++) { await page.keyboard.press(String(i)); await sleep(300); console.log(`answered ${i}:`, (await st()).text); if (!(await learned())) { await page.keyboard.press('e'); await sleep(300); } }
await page.keyboard.press('e'); await sleep(500);
console.log('learned flag:', await learned(), '| quests:', await page.evaluate(() => game.questLog().filter((q) => q.state !== 'locked').map((q) => q.title + ':' + q.state).join(', ')));
await page.screenshot({ path: prefix + '_after.png' });
console.log(logs.join('\n') || 'no console errors/warnings');
await browser.close();
