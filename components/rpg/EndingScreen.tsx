'use client';

import type { NarrativeGraph } from '@/game/schemas/narrative';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Ending screen.
 *
 * Shown when the finale mission completes. It pays off the learning promise:
 * what the player now understands about the repository, and what they did.
 */

export interface EndingScreenProps {
  narrative: NarrativeGraph;
  state: GameState;
  accent: string;
  onClose: () => void;
  onReplay: () => void;
}

export function EndingScreen({ narrative, state, accent, onClose, onReplay }: EndingScreenProps) {
  const completedMissions = narrative.missions.filter(
    (m) => state.quests.find((q) => q.quest_id === m.id)?.status === 'completed',
  );
  const metCharacters = narrative.characters.filter((c) => state.player.discovered.includes(c.id));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 85,
        background: 'rgba(6, 9, 16, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: 'min(720px, 94vw)', ...panelStyle(accent), padding: 28, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: accent, opacity: 0.85 }}>
          The Understanding
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{narrative.world_id}</div>

        <div style={{ marginTop: 18, fontSize: 15, lineHeight: 1.7, color: '#eef2f8' }}>
          {narrative.learning_promise}
        </div>

        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Stat label="Missions completed" value={`${completedMissions.length} / ${narrative.missions.length}`} accent={accent} />
          <Stat label="Characters met" value={`${metCharacters.length} / ${narrative.characters.length}`} accent={accent} />
          <Stat label="Components understood" value={String(state.codex.length)} accent={accent} />
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9aa7b8' }}>
            The conflict you resolved
          </div>
          <div style={{ fontSize: 13, color: '#c7d2e0', marginTop: 4, lineHeight: 1.6 }}>
            {narrative.central_conflict}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button type="button" style={buttonStyle(accent)} onClick={onClose}>Keep exploring</button>
          <button type="button" style={buttonStyle('#8b98ad')} onClick={onReplay}>Play again</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ border: `1px solid ${accent}44`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#9aa7b8' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: accent }}>{value}</div>
    </div>
  );
}
