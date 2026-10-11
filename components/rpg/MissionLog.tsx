'use client';

import type { NarrativeGraph } from '@/game/schemas/narrative';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Mission log.
 *
 * Shows the story's missions grouped by beat, with their hook, stakes and
 * objective progress. All content comes from the narrative — nothing is
 * authored in the UI.
 */

export interface MissionLogProps {
  narrative: NarrativeGraph;
  state: GameState;
  accent: string;
  onClose: () => void;
}

export function MissionLog({ narrative, state, accent, onClose }: MissionLogProps) {
  const missionProgress = (missionId: string) => {
    const progress = state.quests.find((q) => q.quest_id === missionId);
    return progress?.status ?? 'locked';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
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
        <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>Missions</div>
        <button type="button" style={buttonStyle(accent)} onClick={onClose}>Close</button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#9aa7b8', lineHeight: 1.6 }}>
        {narrative.premise}
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {narrative.beats.map((beat) => {
          const missions = narrative.missions.filter((m) => m.beat_id === beat.id);
          if (missions.length === 0) return null;
          return (
            <div key={beat.id}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: accent, opacity: 0.85 }}>
                {beat.title}
              </div>
              <div style={{ fontSize: 11, color: '#7f8ba0', marginBottom: 8 }}>{beat.summary}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missions.map((mission) => {
                  const status = missionProgress(mission.id);
                  const progress = state.quests.find((q) => q.quest_id === mission.id);
                  const completed = progress?.completed_objectives ?? [];
                  return (
                    <div
                      key={mission.id}
                      style={{
                        border: `1px solid ${status === 'completed' ? accent : '#2b3445'}`,
                        borderRadius: 8,
                        padding: 12,
                        opacity: status === 'locked' ? 0.5 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>{mission.title}</div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: status === 'completed' ? accent : '#9aa7b8' }}>
                          {mission.kind}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#c7d2e0', marginTop: 4, fontStyle: 'italic' }}>
                        {mission.hook}
                      </div>
                      <div style={{ fontSize: 11, color: '#8b98ad', marginTop: 6 }}>{mission.stakes}</div>

                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {mission.objectives.map((objective) => {
                          const done = completed.includes(objective.id);
                          return (
                            <div key={objective.id} style={{ fontSize: 12, color: done ? accent : '#c7d2e0' }}>
                              {done ? '✓' : '○'} {objective.text}
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
        })}
      </div>
    </div>
  );
}
