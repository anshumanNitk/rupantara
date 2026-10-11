'use client';

import { useState } from 'react';
import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';
import type { FreeConversation } from './useDialogue';

/**
 * Dialogue panel.
 *
 * Renders a validated dialogue node and its choices. When the NPC carries
 * grounded facts, the player may also switch to free-form conversation, which
 * is answered by the dialogue provider chain (LLM -> scripted fallback).
 *
 * The panel only knows the dialogue schema and the conversation shape, never
 * where the text came from.
 */

export interface DialoguePanelProps {
  pack: GamePack;
  state: GameState;
  onChoice: (choiceId: string) => void;
  onClose: () => void;
  /** Free-form conversation, when available for this NPC. */
  conversation?: FreeConversation | null;
  onStartConversation?: () => void;
  onSend?: (text: string) => void;
  onCloseConversation?: () => void;
}

export function DialoguePanel({
  pack,
  state,
  onChoice,
  onClose,
  conversation = null,
  onStartConversation,
  onSend,
  onCloseConversation,
}: DialoguePanelProps) {
  const accent = pack.theme.palette.accent;
  const [draft, setDraft] = useState('');
  const { npc_id, node_id } = state.dialogue;

  if (conversation) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40,
          width: 'min(680px, 92vw)',
          ...panelStyle(accent),
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 6 }}>
          {conversation.speaker}
        </div>
        <div style={{ fontSize: 14, color: '#e6ecf5', lineHeight: 1.6, minHeight: 40 }}>
          {conversation.pending ? '…' : conversation.text}
        </div>

        <form
          style={{ display: 'flex', gap: 8, marginTop: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text || conversation.pending) return;
            setDraft('');
            onSend?.(text);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say something…"
            style={{
              flex: 1,
              background: 'rgba(10,14,22,0.7)',
              border: `1px solid ${accent}55`,
              borderRadius: 8,
              color: '#e6ecf5',
              padding: '8px 10px',
              fontSize: 13,
            }}
          />
          <button type="submit" style={buttonStyle(accent)} disabled={conversation.pending}>
            Send
          </button>
          <button type="button" style={buttonStyle('#8b98ad')} onClick={onCloseConversation}>
            Leave
          </button>
        </form>
      </div>
    );
  }

  if (npc_id === null || node_id === null) return null;

  const tree = pack.dialogues.find((d) => d.npc_id === npc_id);
  const node = tree?.nodes.find((n) => n.id === node_id);
  if (!node) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        width: 'min(680px, 92vw)',
        ...panelStyle(accent),
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 6 }}>{node.speaker}</div>
      <div style={{ fontSize: 14, color: '#e6ecf5', lineHeight: 1.6 }}>{node.text}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {node.choices.map((choice) => (
          <button key={choice.id} type="button" style={buttonStyle(accent)} onClick={() => onChoice(choice.id)}>
            {choice.label}
          </button>
        ))}
        {onStartConversation && (
          <button type="button" style={buttonStyle('#7fd1a8')} onClick={onStartConversation}>
            Converse freely
          </button>
        )}
        <button type="button" style={buttonStyle('#8b98ad')} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
