import type { EntityDef, GamePack } from '../core/types';

// A tiny hand-written Game Pack: "The Slow Database" (teaches caching).
// This is exactly the JSON your AI pipeline would emit.
const rows = [
  '~~~~~~~~~~~~~~~~~~~~~~~~',
  '~......,,.......,,.....~',
  '~..,.......====........~',
  '~.........=..=.........~',
  '~.........=..=....,,...~',
  '~..,......=..=.........~',
  '~.........=..=.........~',
  '~======================~',
  '~.........=..=.........~',
  '~..ffffff.=..=.ffff....~',
  '~..ffffff.=..=.ffff....~',
  '~..ffffff.=..=.ffff....~',
  '~..ffffff.=..=.........~',
  '~.........=..=..,,.....~',
  '~.........====.........~',
  '~~~~~~~~~~~~~~~~~~~~~~~~',
];

// Vault yard (x 14..19, y 8..12) fenced, with a locked gate at (14,10).
const fence: EntityDef[] = [];
for (let x = 14; x <= 19; x++) for (const y of [8, 12]) fence.push({ id: `fence_${x}_${y}`, kind: 'object', pos: [x, y], asset: { ref: 'fence' } });
for (const y of [9, 11]) fence.push({ id: `fence_14_${y}`, kind: 'object', pos: [14, y], asset: { shape: { type: 'fence', rotate: 90 } } });
for (const y of [9, 10, 11]) fence.push({ id: `fence_19_${y}`, kind: 'object', pos: [19, y], asset: { shape: { type: 'fence', rotate: 90 } } });

const trees: EntityDef[] = [[2, 2], [4, 1], [8, 4], [20, 5], [21, 13], [2, 13], [6, 14], [17, 14]].map(([x, y], i) => ({
  id: `tree_${i}`, kind: 'object' as const, pos: [x, y] as [number, number], asset: { ref: 'oak tree' },
}));

export const demoPack: GamePack = {
  version: '0.1',
  meta: { title: 'The Slow Database', theme: 'systems_hamlet', seed: 42 },
  style: { camera: 'iso', pixelScale: 3, background: '#9ad1e8' },
  map: {
    width: 24, height: 16, rows,
    legend: {
      '~': { terrain: 'water', walkable: false, color: '#3a86c8', height: -0.15 },
      '.': { terrain: 'grass', walkable: true, color: '#7cc576' },
      ',': { terrain: 'grass2', walkable: true, color: '#68b363' },
      '=': { terrain: 'path', walkable: true, color: '#d8c18f' },
      f: { terrain: 'floor', walkable: true, color: '#a9b4c2' },
    },
  },
  items: {
    cache_key: { name: 'Cache Key', description: 'Opens the vault gate.' },
    coin: { name: 'Coin' },
  },
  entities: [
    { id: 'player', kind: 'player', name: 'You', pos: [11, 7], asset: { sprite: { procedural: { shirt: '#3a86ff', hair: '#5a3825' } } } },
    {
      id: 'archivist', kind: 'npc', name: 'Archivist', pos: [5, 10],
      asset: { sprite: { procedural: { shirt: '#9b5de5', hair: '#cccccc', pants: '#444466' } } },
      npc: { dialogueId: 'archivist', wander: { radius: 2 } },
    },
    {
      id: 'ledger', kind: 'npc', name: 'Ledger the Clerk', pos: [12, 5],
      asset: { sprite: { procedural: { shirt: '#f15bb5', hair: '#222222' } } },
      npc: {
        llm: true, dialogueId: 'clerk_fallback', persona: 'A cheerful, slightly nervous clerk who runs the village ledger.',
        facts: ['The vault gate at the east yard is locked; it needs the Cache Key.', 'A cache stores frequently used data close by so the slow database is hit less often.', 'The terminal inside the vault yard can warm the cache.'],
        wander: { radius: 1, speed: 0.8 },
      },
    },
    { id: 'house', kind: 'object', name: "Clerk's House", pos: [16, 2], size: [3, 3], asset: { ref: 'house' } },
    { id: 'sign', kind: 'object', name: 'Sign', pos: [12, 8], asset: { ref: 'sign' }, interact: { label: 'Read', actions: [{ do: 'say', text: 'East Yard: the Vault. Authorized access only. (Keys at the shore.)' }] } },
    { id: 'well', kind: 'object', pos: [3, 4], asset: { ref: 'well' } },
    { id: 'lamp1', kind: 'object', pos: [9, 6], asset: { ref: 'lamp' } },
    { id: 'shelf1', kind: 'object', pos: [3, 9], asset: { ref: 'bookshelf' }, interact: { label: 'Browse', actions: [{ do: 'say', text: 'Every book is labeled "SLOW: fetched from deep storage".' }] } },
    { id: 'shelf2', kind: 'object', pos: [4, 9], asset: { ref: 'bookshelf' } },
    { id: 'key', kind: 'item', name: 'Shiny Key', pos: [21, 2], asset: { ref: 'key' }, interact: { label: 'Pick up', once: true, actions: [{ do: 'give', item: 'cache_key' }, { do: 'say', text: 'You found the Cache Key!' }, { do: 'toggle' }] } },
    {
      id: 'vault_gate', kind: 'object', name: 'Vault Gate', pos: [14, 10], asset: { ref: 'door' },
      interact: { label: 'Unlock', requires: [{ has: 'cache_key' }], failText: 'Locked. You need the Cache Key.', once: true, actions: [{ do: 'take', item: 'cache_key' }, { do: 'say', text: 'The gate swings open.' }, { do: 'toggle' }] },
    },
    { id: 'terminal', kind: 'object', name: 'Terminal', pos: [17, 10], asset: { ref: 'terminal' }, interact: { label: 'Warm cache', once: true, usedText: 'The cache is warm.', actions: [{ do: 'flag', key: 'cache_enabled' }, { do: 'say', text: 'Cache warmed. Query latency: 200ms -> 2ms.' }] } },
    { id: 'rack', kind: 'object', pos: [18, 9], asset: { ref: 'server rack' } },
    ...fence, ...trees,
  ],
  quests: [
    { id: 'q1', title: 'The Slow Database', description: 'Learn why everything is slow.', objectives: [{ id: 'o1', type: 'talk', target: 'archivist', text: 'Talk to the Archivist' }], learningGoal: 'latency' },
    { id: 'q2', title: 'Find the Cache Key', prerequisites: ['q1'], objectives: [{ id: 'o1', type: 'collect', target: 'cache_key', text: 'Pick up the shiny key (NE shore)' }, { id: 'o2', type: 'interact', target: 'vault_gate', text: 'Unlock the Vault Gate' }] },
    { id: 'q3', title: 'Warm the Cache', prerequisites: ['q2'], objectives: [{ id: 'o1', type: 'flag', target: 'cache_enabled', text: 'Warm the cache at the terminal' }], rewards: [{ do: 'give', item: 'coin', n: 5 }, { do: 'say', text: 'Quest complete! You learned: caching reduces slow lookups.' }], learningGoal: 'caching' },
  ],
  dialogues: {
    archivist: {
      start: 'hello',
      nodes: {
        hello: { text: 'Welcome. Every lookup here goes to the deep database. It is... slow.', choices: [{ text: 'Why is it slow?', next: 'why' }, { text: 'What can I do?', next: 'do' }, { text: 'Goodbye.' }] },
        why: { text: 'Each request travels far to fetch the same answers again and again.', next: 'do' },
        do: { text: 'Find the Cache Key at the north-east shore, open the Vault, and warm the cache at the terminal.', actions: [{ do: 'flag', key: 'met_archivist' }] },
      },
    },
    clerk_fallback: { start: 'a', nodes: { a: { text: "Sorry, I'm busy with the ledger right now." } } },
  },
};
