// Bundles src/demo/main.ts (+ three.js) into ONE self-contained html.
// Usage: node scripts/build-demo.mjs [pack.json] [out.html]   (no pack = built-in hand-written demo)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const [packFile, outFile = 'demo.html'] = process.argv.slice(2);
const out = await build({ entryPoints: ['src/demo/main.ts'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = out.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const pack = packFile ? `<script>window.__PACK__=${readFileSync(packFile, 'utf8').replace(/</g, '\\u003c')}</script>` : '';
writeFileSync(outFile, `<!doctype html><html><head><meta charset="utf-8"><title>rpgkit</title>
<style>html,body{margin:0;height:100%;background:#111;overflow:hidden}#app{position:fixed;inset:0}
#help{position:fixed;bottom:6px;left:8px;color:#fff9;font:12px monospace;z-index:2}</style></head>
<body><div id="app"></div><div id="help">WASD/arrows move · click to walk · E interact · 1-9 choose · Esc leave</div>
${pack}<script>${js}</script></body></html>`);
console.log('wrote', outFile, (js.length / 1024).toFixed(0) + ' KB bundle');
