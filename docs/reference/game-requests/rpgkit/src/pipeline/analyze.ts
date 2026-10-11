import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, type RawFile, type RepoGraph } from './graph';

// ============================================================================
// Repo analyzer (Node only). Deterministic: no LLM. Handles JS/TS and Python imports.
// Other languages are not parsed yet (they are skipped, not guessed at).
// ============================================================================
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor', '__pycache__', '.venv', 'venv', 'env', '.next', 'target', '.tox', '.mypy_cache', 'site-packages', 'docs', 'doc', 'examples', 'example', 'scripts', 'benchmarks']);
const TEST_RE = /(^|\/)(tests?|__tests__|spec|e2e|testing)(\/|$)|\.(test|spec)\.[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)conftest\.py$|\.test-d\.[jt]s$|(^|\/)[\w.-]*\.config\.[cm]?[jt]s$|(^|\/)(setup|conf|noxfile|tasks|manage)\.py$/;
const LANGS: Record<string, string> = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx', '.mjs': 'mjs', '.cjs': 'cjs', '.py': 'py' };
const MAX_BYTES = 300_000;

export interface AnalyzeOptions { name?: string; maxFiles?: number; maxModules?: number; includeTests?: boolean }

function walk(root: string, dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; // dot-dirs and dot-files (.git, .prettierrc.js, ...)
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, full, out); }
    else if (LANGS[path.extname(e.name)] && !e.name.endsWith('.d.ts')) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);

function summaryOf(lang: string, src: string): string | undefined {
  if (lang === 'py') {
    const m = src.match(/^(?:\s*#.*\n)*\s*[rRuU]?("""|''')([\s\S]*?)\1/);
    const line = m?.[2].split('\n').map((l) => l.trim()).find(Boolean);
    return line ? clean(line) : undefined;
  }
  const blk = src.match(/^\s*(?:#!.*\n)?\s*\/\*\*?([\s\S]*?)\*\//);
  const lines = blk
    ? blk[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim())
    : src.split('\n').slice(0, 12).filter((l) => l.trim().startsWith('//')).map((l) => l.replace(/^\s*\/\/+\s?/, '').replace(/^[=\-\s]+$/, '').trim());
  const line = lines.find((l) => l && !l.startsWith('@') && !/^[=\-*_]+$/.test(l));
  return line ? clean(line) : undefined;
}

function symbolsOf(lang: string, src: string): string[] {
  const re = lang === 'py'
    ? /^(?:async\s+def|def|class)\s+([A-Za-z]\w*)/gm
    : /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const out: string[] = [];
  for (const m of src.matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
  return out.slice(0, 30);
}

function jsSpecs(src: string): string[] {
  const out: string[] = [];
  for (const re of [/(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g])
    for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function resolveJs(from: string, spec: string, files: Set<string>): string | null {
  let base: string;
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (spec.startsWith('@/') || spec.startsWith('~/')) base = 'src/' + spec.slice(2);
  else return null; // bare package imports are external
  const stripped = base.replace(/\.(m|c)?js$/, '');
  for (const b of [base, stripped])
    for (const c of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'])
      if (files.has(b + c)) return b + c;
  return null;
}

/** Python: dotted-suffix index so `import requests.api` finds `src/requests/api.py`. */
function pyIndex(files: string[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const f of files.filter((f) => f.endsWith('.py'))) {
    const segs = f.replace(/\.py$/, '').split('/'); if (segs.at(-1) === '__init__') segs.pop();
    for (let i = 0; i < segs.length; i++) { const k = segs.slice(i).join('.'); if (k && !idx.has(k)) idx.set(k, f); }
  }
  return idx;
}

function pySpecs(src: string): { mod: string; names: string[] }[] {
  const out: { mod: string; names: string[] }[] = [];
  for (const m of src.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+\(?([^\n#]*)/gm))
    out.push({ mod: m[1], names: m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].replace(/[()\\]/g, '').trim()).filter((s) => /^\w+$/.test(s)) });
  for (const m of src.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm))
    for (const s of m[1].split(',')) { const t = s.trim().split(/\s+as\s+/)[0]; if (t) out.push({ mod: t, names: [] }); }
  return out;
}

function resolvePy(from: string, s: { mod: string; names: string[] }, files: Set<string>, idx: Map<string, string>): string[] {
  const hits = new Set<string>();
  const lead = s.mod.match(/^\.*/)![0].length, rest = s.mod.slice(lead);
  const tryRel = (dotted: string) => {
    let dir = path.posix.dirname(from);
    for (let i = 1; i < lead; i++) dir = path.posix.dirname(dir);
    const p = path.posix.join(dir, dotted.replace(/\./g, '/'));
    for (const c of [p + '.py', p + '/__init__.py']) if (files.has(c)) return c;
    return null;
  };
  const lookup = (dotted: string) => (lead ? tryRel(dotted) : idx.get(dotted) ?? null);
  // `from pkg import a, b`: a and b may be submodules (-> those files) or symbols defined in pkg/__init__ (-> the package file)
  const base = lead && !rest ? (files.has(path.posix.join(path.posix.dirname(from), '__init__.py')) ? path.posix.join(path.posix.dirname(from), '__init__.py') : null) : lookup(rest);
  let unresolved = s.names.length === 0;
  for (const n of s.names) { const sub = lookup(rest ? `${rest}.${n}` : n); if (sub && sub !== from) hits.add(sub); else unresolved = true; }
  if (base && base !== from && unresolved) hits.add(base);
  return [...hits];
}

function readmeInfo(dir: string): string | undefined {
  for (const n of ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README']) {
    const p = path.join(dir, n); if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8').slice(0, 6000);
    const para = text.split(/\n\s*\n/).map((b) => b.trim()).find((b) => b.length > 40 && !/^[#!\[<=\-|`*]/.test(b) && !/^\.\. /.test(b));
    if (para) return clean(para.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '')).slice(0, 220);
  }
  return undefined;
}

export function analyzeRepo(dir: string, o: AnalyzeOptions = {}): RepoGraph {
  const root = path.resolve(dir);
  let all: string[] = []; walk(root, root, all);
  if (!o.includeTests) all = all.filter((f) => !TEST_RE.test(f));
  all = all.filter((f) => { try { return fs.statSync(path.join(root, f)).size <= MAX_BYTES; } catch { return false; } });
  if (all.length > (o.maxFiles ?? 500)) all = all.sort((a, b) => fs.statSync(path.join(root, b)).size - fs.statSync(path.join(root, a)).size).slice(0, o.maxFiles ?? 500);
  const set = new Set(all), pyIdx = pyIndex(all);

  const raw: RawFile[] = [];
  for (const id of all) {
    const src = fs.readFileSync(path.join(root, id), 'utf8');
    const lines = src.split('\n');
    if (lines.length > 20 && src.length / lines.length > 200) continue; // minified / generated
    const lang = LANGS[path.extname(id)];
    const imports = new Set<string>();
    if (lang === 'py') for (const s of pySpecs(src)) for (const t of resolvePy(id, s, set, pyIdx)) imports.add(t);
    else for (const s of jsSpecs(src)) { const t = resolveJs(id, s, set); if (t && t !== id) imports.add(t); }
    raw.push({ id, lang, loc: lines.filter((l) => l.trim()).length, summary: summaryOf(lang, src), symbols: symbolsOf(lang, src), imports: [...imports] });
  }

  let name = o.name ?? path.basename(root);
  const pj = path.join(root, 'package.json');
  if (!o.name && fs.existsSync(pj)) { try { name = JSON.parse(fs.readFileSync(pj, 'utf8')).name ?? name; } catch { /* keep dir name */ } }
  return buildGraph(raw, { name, description: readmeInfo(root), maxModules: o.maxModules });
}
