import type { GamePack } from '../schemas/gamePack';
import type { Npc } from '../schemas/npc';
import type { GameState } from '../schemas/gameState';
import { LLMProvider, ScriptedProvider, type DialogueProvider } from './providers';

/**
 * Client-side LLM dialogue provider.
 *
 * Calls the server route `/api/dialogue`, which proxies to the Dialogue Agent.
 * The browser never holds an API key and never talks to the model directly.
 *
 * The provider is best-effort: any failure falls back to the scripted tree, so
 * conversation always works even with no service running.
 */

async function complete(request: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  // The server route expects structured fields, not a raw prompt. We pass the
  // system prompt through as `persona` context is already embedded; instead we
  // forward the conversation and let the server rebuild the system prompt from
  // the grounded facts it is given.
  const response = await fetch('/api/dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'NPC',
      world_name: 'the realm',
      persona: request.system,
      facts: [],
      history: request.messages.map((m) => ({
        role: m.role === 'user' ? 'player' : 'npc',
        text: m.content,
      })),
    }),
  });

  if (!response.ok) throw new Error(`dialogue route ${response.status}`);
  const payload = (await response.json()) as { text?: string };
  if (!payload.text) throw new Error('empty dialogue response');
  return payload.text;
}

/**
 * Builds the dialogue provider chain for a pack:
 *   LLM (grounded, free-form) -> scripted (deterministic fallback)
 *
 * The LLM provider only handles NPCs that carry grounded facts; everyone else
 * uses the scripted tree.
 */
export function createDialogueProviders(pack: GamePack): DialogueProvider[] {
  const scripted = new ScriptedProvider();
  const llm = new LLMProvider({ complete, fallback: scripted, maxHistory: 6 });
  return [llm, scripted];
}

/** Convenience: the grounded facts for an NPC, if any. */
export function factsForNpc(pack: GamePack, npc: Npc): string[] {
  const character = pack.narrative?.characters.find(
    (c) => c.architecture_node_id === npc.architecture_entity_id,
  );
  return character?.facts ?? [];
}

/** Convenience: whether an NPC can hold a free-form conversation. */
export function canConverse(pack: GamePack, npc: Npc, state: GameState): boolean {
  void state;
  return factsForNpc(pack, npc).length > 0;
}
