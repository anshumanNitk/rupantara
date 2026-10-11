import type { Action, DialogueNode, DialogueTree, EntityDef, GamePack, Quest } from '../core/types';
import { validatePack } from '../core/validate';
import type { RepoGraph } from './graph';
import { layoutRepo } from './layout';
import { baseName, hashStr, mulberry32, shuffle, slug } from './util';

// ============================================================================
// Compiler: RepoGraph -> Game Pack. Structure, quests and quiz answers come from the graph
// (deterministic, grounded). An optional `polish` hook lets an LLM reword flavour text ONLY;
// it never touches quest logic, quiz choices or answers.
// ============================================================================
export interface CompileOptions {
  seed?: number;
  perDistrict?: number;
  polish?: (kind: 'guide_intro' | 'keeper_intro', text: string, facts: string[]) => Promise<string>;
}

const LANG_COLOR: Record<string, string> = { ts: '#8ecae6', tsx: '#8ecae6', js: '#ffe08a', jsx: '#ffe08a', mjs: '#ffe08a', cjs: '#ffe08a', py: '#b8e0a8' };
const ROOF = ['#c1440e', '#6a4c93', '#1982c4', '#d1495b', '#edae49', '#00798c', '#8d6a9f', '#2a9d8f', '#e76f51', '#6d597a'];
const list = (a: string[], n = 4) => (a.length <= n ? a.join(', ') : `${a.slice(0, n).join(', ')} +${a.length - n} more`);
const bid = (file: string) => `bld_${slug(file)}`;

export async function compileRepoPack(g: RepoGraph, o: CompileOptions = {}): Promise<GamePack> {
  const seed = o.seed ?? 1;
  const L = layoutRepo(g, seed, o.perDistrict ?? 12);
  const polish = o.polish ?? (async (_k, t) => t);
  const M = g.modules;
  const nameOf = (id: string) => M[id].name;
  const entities: EntityDef[] = [];
  const items: GamePack['items'] = {};
  const dialogues: Record<string, DialogueTree> = {};
  const quests: Quest[] = [];

  entities.push({ id: 'player', kind: 'player', name: 'You', pos: L.spawn, asset: { sprite: { procedural: { shirt: '#3a86ff', hair: '#5a3825' } } } });

  // ---- districts: buildings (files), sign, keeper NPC
  g.order.forEach((mid, mi) => {
    const m = M[mid], d = L.districts[mid];
    const roof = ROOF[mi % ROOF.length];
    for (const f of d.files) {
      const fn = g.files[f], isEntry = f === g.entry, [x, y] = L.buildings[f];
      const bits = [
        `${baseName(f)}${fn.summary ? `: ${fn.summary}` : ''}`,
        `${fn.loc} lines`,
        fn.symbols.length ? `defines ${list(fn.symbols, 4)}` : '',
        fn.imports.length ? `imports ${fn.imports.length} local file${fn.imports.length > 1 ? 's' : ''}` : '',
        fn.indeg ? `used by ${fn.indeg} file${fn.indeg > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      entities.push({
        id: bid(f), kind: 'object', name: baseName(f), pos: [x, y], size: [2, 2], blocks: true,
        asset: { shape: { type: isEntry ? 'tower' : 'house', size: [1.7, 0.9 + Math.min(fn.loc, 600) / 600 * 1.1, 1.7], color: LANG_COLOR[fn.lang] ?? '#ddd', roofColor: roof } },
        interact: { label: isEntry ? 'Enter the Entry Point' : 'Inspect', actions: [{ do: 'say', text: bits.join(' · ') }] },
        state: { source: f },
      });
    }
    const hidden = m.files.length - d.files.length;
    const nDeps = m.deps.map(nameOf), nUsers = m.dependents.map(nameOf);
    entities.push({
      id: `sign_${mid}`, kind: 'object', name: `${m.name} district`, pos: L.sign[mid], blocks: true, asset: { ref: 'sign' },
      interact: { label: 'Read', actions: [{ do: 'say', text: `${m.name}: ${m.files.length} files, ${m.loc} lines${nDeps.length ? ` · builds on ${list(nDeps)}` : ' · a foundation module'}${nUsers.length ? ` · used by ${list(nUsers)}` : ''}${hidden > 0 ? ` · ${hidden} smaller files not shown` : ''}` }] },
      state: { source: m.key },
    });
    entities.push({
      id: `keeper_${mid}`, kind: 'npc', name: `Keeper of ${m.name}`, pos: L.keeper[mid],
      asset: { sprite: { procedural: { shirt: ROOF[mi % ROOF.length], hair: ['#2b2118', '#caa472', '#7a7a7a', '#5a3825'][hashStr(mid) % 4] } } },
      npc: { dialogueId: `dlg_${mid}`, wander: { radius: 1, speed: 0.6 } },
      state: { source: m.key },
    });
    items![`badge_${mid}`] = { name: `${m.name} Badge`, description: `Proof you understand the ${m.name} module.` };
  });
  items!['badge_master'] = { name: 'Master Badge', description: `You understand how ${g.name} fits together.` };

  // ---- trees
  L.trees.forEach(([x, y], i) => entities.push({ id: `tree_${i}`, kind: 'object', pos: [x, y], asset: { ref: 'tree' } }));

  // ---- keeper dialogue (about + quiz); quiz is built from the dependency graph, so the answer is verifiable
  for (const mid of g.order) {
    const m = M[mid], rnd = mulberry32(hashStr(`${seed}:${mid}`));
    const prereqQuests = m.preDeps.map((d) => `q_${d}`);
    const top = L.districts[mid].files.slice(0, 3).map(baseName);
    const facts = [`${m.name} has ${m.files.length} files and ${m.loc} lines.`, `Main files: ${list(top, 3)}.`, m.deps.length ? `It builds on: ${list(m.deps.map(nameOf))}.` : 'It depends on no other module here, so it is a foundation.', m.dependents.length ? `It is used by: ${list(m.dependents.map(nameOf))}.` : 'Nothing else here depends on it.'];
    const intro = await polish('keeper_intro', `Welcome to ${m.name}. ${m.preDeps.length ? `I only quiz travelers who already know ${list(m.preDeps.map(nameOf))}.` : 'Every journey starts with the foundations.'}`, facts);

    let question: { text: string; choices: string[]; correct: number } | null = null;
    const pickWrong = (exclude: Set<string>) => shuffle(Object.keys(M).filter((x) => x !== mid && !exclude.has(x)), rnd).slice(0, 2).map(nameOf);
    if (m.deps.length) {
      const right = nameOf(m.deps[Math.floor(rnd() * m.deps.length)]), wrong = pickWrong(new Set(m.deps));
      if (wrong.length) { const ch = shuffle([right, ...wrong], rnd); question = { text: `Which of these does ${m.name} import from?`, choices: ch, correct: ch.indexOf(right) }; }
    } else if (m.dependents.length) {
      const right = nameOf(m.dependents[Math.floor(rnd() * m.dependents.length)]), wrong = pickWrong(new Set(m.dependents));
      if (wrong.length) { const ch = shuffle([right, ...wrong], rnd); question = { text: `Which of these relies on ${m.name}?`, choices: ch, correct: ch.indexOf(right) }; }
    }

    const learned: Action = { do: 'flag', key: `learned_${mid}` };
    const nodes: Record<string, DialogueNode> = {
      hello: { text: intro, choices: [{ text: 'What is this district?', next: 'about' }, { text: "I'm ready for your question.", next: 'ready', requires: prereqQuests.map((quest) => ({ quest, state: 'done' as const })) }, { text: 'Goodbye.' }] },
      about: { text: facts.join(' '), next: 'hello' },
    };
    if (question) {
      const near = [...new Set([...m.deps, ...m.dependents])].map(nameOf);
      nodes.ready = { text: question.text, choices: question.choices.map((c, i) => ({ text: c, next: i === question!.correct ? 'right' : 'wrong' })) };
      nodes.right = { text: `Correct! You understand how ${m.name} fits in.`, actions: [learned] };
      nodes.wrong = { text: `Not quite. Follow the roads: ${m.name} connects to ${list(near, 4)}.`, next: 'ready' };
    } else nodes.ready = { text: `${m.name} stands alone, so there is nothing to quiz. You know it well enough.`, actions: [learned] };
    dialogues[`dlg_${mid}`] = { start: 'hello', nodes };

    // ---- quest per module
    const key = L.districts[mid].files.slice(0, 2);
    quests.push({
      id: `q_${mid}`, title: `Learn ${m.name}`, description: facts.join(' '),
      prerequisites: prereqQuests,
      objectives: [{ id: 'quiz', type: 'flag', target: `learned_${mid}`, text: `Pass the ${m.name} keeper's question` }, ...key.map((f, i) => ({ id: `f${i}`, type: 'interact' as const, target: bid(f), text: `Inspect ${baseName(f)}` }))],
      rewards: [{ do: 'give', item: `badge_${mid}` }, { do: 'say', text: `Badge earned: ${m.name}` }],
      learningGoal: `Understand the role of ${m.name} (${m.files.length} files) and its dependencies.`,
    });
  }

  // ---- final quest: the entry point
  const sinks = g.order.filter((id) => !g.order.some((o2) => M[o2].preDeps.includes(id)));
  const entryName = g.entry ? baseName(g.entry) : 'the entry point';
  if (g.entry) quests.push({
    id: 'q_final', title: 'Reach the Entry Point', description: `Everything flows through ${entryName}.`,
    prerequisites: sinks.map((s) => `q_${s}`),
    objectives: [{ id: 'enter', type: 'interact', target: bid(g.entry), text: `Enter ${entryName}` }],
    rewards: [{ do: 'give', item: 'badge_master' }, { do: 'say', text: `You now understand how ${g.name} fits together!` }],
    learningGoal: `See how ${g.name} is assembled from its modules.`,
  });

  // ---- guide NPC (LLM-ready; scripted fallback)
  const modFacts = g.order.map((id) => { const m = M[id], f = g.files[L.districts[id].files[0]]; return `${m.name}: ${m.loc} lines${f?.summary ? `; e.g. ${baseName(f.id)} - ${f.summary}` : ''}${m.deps.length ? `; builds on ${list(m.deps.map(nameOf))}` : '; foundation'}.`; });
  const guideFacts = [g.description ? `${g.name}: ${g.description}` : `${g.name} is a code repository.`, ...modFacts, g.entry ? `Entry point: ${g.entry}.` : ''].filter(Boolean);
  const found = g.order.filter((id) => M[id].layer === 0).map(nameOf);
  const guideIntro = await polish('guide_intro', `Welcome to the land of ${g.name}! ${g.description ?? ''} It has ${g.order.length} districts. Foundations lie to the west; the code builds up toward the east${g.entry ? `, ending at ${entryName}` : ''}.`.replace(/\s+/g, ' '), guideFacts);
  entities.push({
    id: 'guide', kind: 'npc', name: 'Guide', pos: L.guide, asset: { sprite: { procedural: { shirt: '#ffd166', hair: '#222' } } },
    npc: { llm: true, dialogueId: 'guide', persona: `A friendly guide to the ${g.name} codebase, explaining it like a local explaining their town.`, facts: guideFacts },
  });
  dialogues.guide = { start: 'hello', nodes: {
    hello: { text: guideIntro, choices: [{ text: 'Where should I start?', next: 'start' }, { text: 'Goodbye.' }] },
    start: { text: `Start with the foundations: ${list(found, 5)}. Talk to each Keeper, inspect buildings, and follow the roads east.`, next: 'hello' },
  } };

  const pack: GamePack = {
    version: '0.1',
    meta: { title: `The Land of ${g.name}`, theme: 'repo', seed, source: { kind: 'repo', name: g.name, files: Object.keys(g.files).length, modules: g.order.length, languages: g.languages, entry: g.entry } },
    style: { camera: 'iso', pixelScale: 3, background: '#9ad1e8' },
    map: { width: L.width, height: L.height, rows: L.rows, legend: L.legend },
    entities, items, quests, dialogues,
  };
  const errors = validatePack(pack).filter((i) => i.level === 'error');
  if (errors.length) throw new Error('Generated pack failed validation:\n' + errors.slice(0, 10).map((e) => `  ${e.code}: ${e.msg}`).join('\n'));
  return pack;
}
