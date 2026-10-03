'use client';

import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Codex panel.
 *
 * Shows the architecture meaning and provenance of a discovered landmark. All
 * factual content comes from the ArchitectureGraph — the RPG naming never
 * obscures the real component. This is where a landmark connects back to its
 * source file/symbol.
 */

export interface CodexPanelProps {
  pack: GamePack;
  state: GameState;
  architecture: ArchitectureGraph;
  /** Entity id to focus, or null to show the full discovered list. */
  entityId: string | null;
  onSelect: (entityId: string) => void;
  onClose: () => void;
}

export function CodexPanel({ pack, state, architecture, entityId, onSelect, onClose }: CodexPanelProps) {
  const accent = pack.theme.palette.accent;
  const nodeById = new Map(architecture.nodes.map((n) => [n.id, n]));

  const discovered = state.codex;
  const focused = entityId ?? discovered[discovered.length - 1] ?? null;
  const node = focused ? nodeById.get(focused) ?? null : null;
  const landmark = focused ? pack.landmarks.find((l) => l.architecture_entity_id === focused) ?? null : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'min(420px, 92vw)',
        zIndex: 50,
        ...panelStyle(accent),
        borderRadius: 0,
        padding: 18,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>Codex</div>
        <button type="button" style={buttonStyle(accent)} onClick={onClose}>Close</button>
      </div>

      {discovered.length === 0 && (
        <div style={{ marginTop: 16, color: '#9aa7b8', fontSize: 13 }}>
          Inspect landmarks to reveal what each one remembers.
        </div>
      )}

      {discovered.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {discovered.map((id) => (
            <button
              key={id}
              type="button"
              style={buttonStyle(id === focused ? accent : '#8b98ad')}
              onClick={() => onSelect(id)}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {node && (
        <div style={{ marginTop: 18, borderTop: '1px solid #2b3445', paddingTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{node.label}</div>
          <div style={{ fontSize: 12, color: accent, marginTop: 2 }}>{node.type}</div>
          {landmark && (
            <div style={{ fontSize: 12, color: '#9aa7b8', marginTop: 6 }}>
              Rendered as: {landmark.archetype.replace(/_/g, ' ')}
            </div>
          )}

          {node.source && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#c7d2e0' }}>
              <div style={{ color: '#9aa7b8', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6 }}>Source</div>
              <div style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                {node.source.file ?? 'unknown file'}
                {node.source.symbol ? ` · ${node.source.symbol}` : ''}
                {node.source.line != null ? `:${node.source.line}` : ''}
              </div>
            </div>
          )}

          {Object.keys(node.metadata).length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#c7d2e0' }}>
              <div style={{ color: '#9aa7b8', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6 }}>Metadata</div>
              <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                {JSON.stringify(node.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
