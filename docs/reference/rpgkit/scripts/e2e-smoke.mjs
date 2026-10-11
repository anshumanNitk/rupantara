import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 960, height: 600 });
const logs = []; page.on('console', (m) => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + path.resolve('demo.html')); await sleep(1500);
const st = () => page.evaluate(() => ({ p: [game.player.x.toFixed(1), game.player.y.toFixed(1)], focus: game.focus, dlg: !!game.dialogue, inv: game.inventory, q: game.questLog().map(q => q.id + ':' + q.state).join(' ') }));

// 1) real keyboard movement: hold 'd' (screen-right) for 600ms
const before = await st(); await page.keyboard.down('d'); await sleep(600); await page.keyboard.up('d'); console.log('keyboard move', before.p, '->', (await st()).p);
// 2) real mouse click-to-walk toward the archivist's area
await page.evaluate(() => game.moveTo([5, 11])); await sleep(4500);
console.log('after walk', await st());
await page.keyboard.press('e'); await sleep(400);
await page.screenshot({ path: '/home/claude/shot2.png' }); console.log('dialogue open', (await st()).dlg);
await page.keyboard.press('1'); await sleep(300); await page.keyboard.press('e'); await sleep(300);
await page.screenshot({ path: '/home/claude/shot3.png' });
await page.keyboard.press('e'); await sleep(300); console.log('after dialogue', await st());
// 3) LLM NPC (mock) with typed free text
await page.evaluate(() => game.moveTo([12, 6])); await sleep(5000);
await page.keyboard.press('e'); await sleep(500);
await page.type('.rk input', 'where is the key?'); await page.keyboard.press('Enter'); await sleep(600);
await page.screenshot({ path: '/home/claude/shot4.png' }); console.log('llm state', await st());
console.log(logs.filter(l => !l.startsWith('log:')).join('\n') || 'no console errors/warnings');
await browser.close();
