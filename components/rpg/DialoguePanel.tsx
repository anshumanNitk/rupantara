'use client';

import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Dialogue panel.
 *
 * Renders a validated dialogue node and its choices. This is the seam where
 * LLM-authored dialogue will appear later: the panel only knows the dialogue
 * schema, never where the text came from.
 */

export interface DialoguePanelProps {
  pack: GamePack;
  state: GameState;
  onChoice: (choiceId: string) => void;
  onClose: () => void;
}

export function DialoguePanel({ pack, state, onChoice, onClose }: DialoguePanelProps) {
  const accent = pack.theme.palette.accent;
  const { npc_id, node_id } = state.dialogue;
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
        <button type="button" style={buttonStyle('#8b98ad')} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
