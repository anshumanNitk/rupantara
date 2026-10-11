'use client';

import type { NarrativeGraph } from '@/game/schemas/narrative';
import type { GameState } from '@/game/schemas/gameState';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Character codex.
 *
 * Shows the people of the world: their backstory, motivation and the real
 * architecture component they embody. This is where the story connects back to
 * the repository — a character is never just flavour, they are a component.
 */

export interface CharacterCodexProps {
  narrative: NarrativeGraph;
  state: GameState;
  architecture: ArchitectureGraph;
  accent: string;
  selectedId: string | null;
  onSelect: (characterId: string) => void;
  onClose: () => void;
}

export function CharacterCodex({
  narrative,
  state,
  architecture,
  accent,
  selectedId,
  onSelect,
  onClose,
}: CharacterCodexProps) {
  const nodeById = new Map(architecture.nodes.map((n) => [n.id, n]));
  const selected =
    narrative.characters.find((c) => c.id === selectedId) ??
    narrative.characters[0] ??
    null;

  const met = (characterId: string) => state.player.discovered.includes(characterId);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'min(460px, 94vw)',
        zIndex: 55,
        ...panelStyle(accent),
        borderRadius: 0,
        padding: 18,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>Characters</div>
        <button type="button" style={buttonStyle(accent)} onClick={onClose}>Close</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {narrative.characters.map((character) => (
          <button
            key={character.id}
            type="button"
            style={buttonStyle(character.id === selected?.id ? accent : '#8b98ad')}
            onClick={() => onSelect(character.id)}
          >
            {met(character.id) ? character.name : '???'}
          </button>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: 18, borderTop: '1px solid #2b3445', paddingTop: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: accent, marginTop: 2 }}>
            {selected.title ?? selected.role}
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: '#c7d2e0', lineHeight: 1.6 }}>
            {selected.backstory}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9aa7b8' }}>
              Motivation
            </div>
            <div style={{ fontSize: 13, color: '#c7d2e0', marginTop: 4 }}>{selected.motivation}</div>
          </div>

          {selected.facts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9aa7b8' }}>
                What they know
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#c7d2e0', lineHeight: 1.6 }}>
                {selected.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: '1px solid #2b3445', paddingTop: 12 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9aa7b8' }}>
              Embodies
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {nodeById.get(selected.architecture_node_id)?.label ?? selected.architecture_node_id}
              <span style={{ color: '#8b98ad' }}>
                {' '}
                · {nodeById.get(selected.architecture_node_id)?.type ?? 'unknown'}
              </span>
            </div>
            {nodeById.get(selected.architecture_node_id)?.source && (
              <div style={{ fontSize: 11, color: '#8b98ad', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                {nodeById.get(selected.architecture_node_id)!.source!.file ?? 'unknown file'}
                {nodeById.get(selected.architecture_node_id)!.source!.symbol
                  ? ` · ${nodeById.get(selected.architecture_node_id)!.source!.symbol}`
                  : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
