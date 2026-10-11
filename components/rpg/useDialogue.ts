'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { createDialogueProviders, canConverse } from '@/game/dialogue/llmClient';
import {
  resolveDialogueProvider,
  type DialogueContext,
  type DialogueTurn,
} from '@/game/dialogue/providers';

/**
 * Free-form conversation hook.
 *
 * The scripted dialogue tree is driven by the reducer. This hook adds an
 * optional LLM layer on top: when the player talks to an NPC that carries
 * grounded facts, they can type freely and the provider chain answers.
 *
 * The hook is deliberately separate from the reducer so the deterministic game
 * state is never polluted by model output. If the model fails, the scripted
 * tree is still there underneath.
 */

export interface FreeConversation {
  npcId: string;
  speaker: string;
  text: string;
  history: { role: 'npc' | 'player'; text: string }[];
  pending: boolean;
}

export function useDialogue(pack: GamePack, state: GameState) {
  const providers = useMemo(() => createDialogueProviders(pack), [pack]);
  const [conversation, setConversation] = useState<FreeConversation | null>(null);
  const mem = useRef<Record<string, unknown>>({});

  const start = useCallback(
    async (npcId: string) => {
      const npc = pack.npcs.find((n) => n.id === npcId);
      if (!npc || !canConverse(pack, npc, state)) return;

      mem.current = {};
      const ctx: DialogueContext = { npc, pack, state, history: [], mem: mem.current };
      const provider = resolveDialogueProvider(providers, npc, ctx);
      if (!provider) return;

      setConversation({ npcId, speaker: npc.label, text: '', history: [], pending: true });
      const turn = await provider.respond(ctx, { type: 'start' });
      setConversation({
        npcId,
        speaker: turn.speaker,
        text: turn.text,
        history: [...ctx.history],
        pending: false,
      });
    },
    [pack, providers, state],
  );

  const send = useCallback(
    async (text: string) => {
      if (!conversation) return;
      const npc = pack.npcs.find((n) => n.id === conversation.npcId);
      if (!npc) return;

      const ctx: DialogueContext = {
        npc,
        pack,
        state,
        history: conversation.history,
        mem: mem.current,
      };
      const provider = resolveDialogueProvider(providers, npc, ctx);
      if (!provider) return;

      setConversation({ ...conversation, pending: true });
      const turn: DialogueTurn = await provider.respond(ctx, { type: 'text', text });
      setConversation({
        npcId: conversation.npcId,
        speaker: turn.speaker,
        text: turn.text,
        history: [...ctx.history],
        pending: false,
      });
    },
    [conversation, pack, providers, state],
  );

  const close = useCallback(() => setConversation(null), []);

  return { conversation, start, send, close };
}
