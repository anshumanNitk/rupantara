'use client';

import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Quest log.
 *
 * Lists every quest with its status and objective progress. All content comes
 * from the compiled GamePack — nothing is authored in the UI.
 */

export interface QuestLogProps {
  pack: GamePack;
  state: GameState;
  onClose: () => void;
}

export function QuestLog({ pack, state, onClose }: QuestLogProps) {
  const accent = pack.theme.palette.accent;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
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
        <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>Quest Log</div>
        <button type="button" style={buttonStyle(accent)} onClick={onClose}>Close</button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {pack.quests.map((quest) => {
          const progress = state.quests.find((q) => q.quest_id === quest.id);
          const status = progress?.status ?? 'locked';
          const completed = progress?.completed_objectives ?? [];

          return (
            <div
              key={quest.id}
              style={{
                border: `1px solid ${status === 'completed' ? accent : '#2b3445'}`,
                borderRadius: 8,
                padding: 12,
                opacity: status === 'locked' ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700 }}>{quest.title}</div>
                <div style={{ fontSize: 11, color: status === 'completed' ? accent : '#9aa7b8', textTransform: 'uppercase' }}>
                  {status}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9aa7b8', marginTop: 4 }}>{quest.summary}</div>

              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {quest.objectives.map((objective) => {
                  const done = completed.includes(objective.id);
                  return (
                    <div key={objective.id} style={{ fontSize: 12, color: done ? accent : '#c7d2e0' }}>
                      {done ? '✓' : '○'} {objective.description}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
