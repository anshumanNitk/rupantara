// node scripts/shot-pack.mjs game.html out-prefix  -> overview + closeup screenshots + console errors
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const [html, prefix] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 700 });
const logs = []; page.on('console', (m) => m.type() !== 'log' && logs.push(m.type() + ': ' + m.text())); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('file://' + path.resolve(html)); await sleep(2500);
await page.screenshot({ path: prefix + '_start.png' });
await page.evaluate(() => { const m = game.pack.map; renderer.setViewSize(Math.max(m.height, m.width / 1.6) * 1.15); }); await sleep(600);
await page.screenshot({ path: prefix + '_overview.png' });
console.log(logs.join('\n') || 'no console errors/warnings');
await browser.close();
