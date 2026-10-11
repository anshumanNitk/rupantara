import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/world/compiler';
import { RPA_ARCHITECTURE } from '@/fixtures/rpaArchitecture';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { createInitialGameState } from '@/game/runtime/gameState';
import {
  ScriptedProvider,
  LLMProvider,
  mockLLM,
  resolveDialogueProvider,
  type DialogueContext,
} from '@/game/dialogue/providers';

function setup() {
  const pack = compileGamePack(buildWorld(RPA_ARCHITECTURE).placed);
  const state = createInitialGameState(pack);
  const npc = pack.npcs.find((n) => n.role === 'guide')!;
  const ctx: DialogueContext = { npc, pack, state, history: [], mem: {} };
  return { pack, state, npc, ctx };
}

describe('Scripted dialogue provider', () => {
  it('handles an NPC with a dialogue tree', () => {
    const { npc, ctx } = setup();
    expect(new ScriptedProvider().canHandle(npc, ctx)).toBe(true);
  });

  it('starts at the root node', async () => {
    const { ctx } = setup();
    const turn = await new ScriptedProvider().respond(ctx, { type: 'start' });
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.choices?.length).toBeGreaterThan(0);
  });

  it('advances through a choice', async () => {
    const { ctx } = setup();
    const provider = new ScriptedProvider();
    await provider.respond(ctx, { type: 'start' });
    const turn = await provider.respond(ctx, { type: 'choice', index: 0 });
    expect(turn.text.length).toBeGreaterThan(0);
  });
});

describe('LLM dialogue provider', () => {
  it('only handles NPCs with grounded facts', () => {
    const { npc, ctx } = setup();
    const provider = new LLMProvider({ complete: mockLLM });
    // The guide embodies a real architecture node and has narrative facts.
    expect(provider.canHandle(npc, ctx)).toBe(true);
  });

  it('produces a grounded response', async () => {
    const { ctx } = setup();
    const provider = new LLMProvider({ complete: mockLLM });
    const turn = await provider.respond(ctx, { type: 'start' });
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.allowText).toBe(true);
  });

  it('falls back to the scripted tree when the model fails', async () => {
    const { ctx } = setup();
    const provider = new LLMProvider({
      complete: async () => {
        throw new Error('model down');
      },
      fallback: new ScriptedProvider(),
    });
    const turn = await provider.respond(ctx, { type: 'start' });
    expect(turn.text.length).toBeGreaterThan(0);
  });

  it('includes grounding facts and an untrusted-input rule in the system prompt', async () => {
    const { ctx } = setup();
    let captured = '';
    const provider = new LLMProvider({
      complete: async (request) => {
        captured = request.system;
        return 'ok';
      },
    });
    await provider.respond(ctx, { type: 'start' });
    expect(captured).toContain('Facts you know');
    expect(captured).toContain('untrusted');
  });

  it('resolves the first provider that can handle the NPC', () => {
    const { npc, ctx } = setup();
    const provider = resolveDialogueProvider(
      [new LLMProvider({ complete: mockLLM }), new ScriptedProvider()],
      npc,
      ctx,
    );
    expect(provider?.name).toBe('llm');
  });
});
