import { Game, LLMProvider, ScriptedProvider, mockLLM, validatePack, createDefaultResolver } from '../index';
import { ThreeRenderer } from '../render/three';
import { HudUI } from '../render/ui';
import { demoPack } from './pack';
import type { GamePack } from '../core/types';

const pack: GamePack = (window as any).__PACK__ ?? demoPack;
const issues = validatePack(pack);
if (issues.length) console.table(issues);

// Swap mockLLM for a real call later, e.g.:
//   complete: async (r) => (await fetch('/api/npc', { method: 'POST', body: JSON.stringify(r) })).text()
const game = new Game(pack, { providers: [new LLMProvider({ complete: mockLLM }), new ScriptedProvider()] });
const resolver = createDefaultResolver(); // add { manifest, catalogs, generator } to import external assets

const container = document.getElementById('app')!;
const renderer = new ThreeRenderer(game, { container, resolver });
new HudUI(game, container);
renderer.init().then(() => { renderer.start(); console.log('assets served by:', renderer.assetReport()); });
(window as any).game = game; (window as any).renderer = renderer; // handy for console debugging
