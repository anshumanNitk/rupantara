'use client';

import { useState } from 'react';
import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Quiz panel.
 *
 * Shown when a quest's objectives are complete but its verifiable quiz has not
 * been passed. The question and its answer come from the compiled pack (derived
 * from the dependency graph), never from the UI.
 *
 * This is the "prove you understand" moment: the player cannot finish a quest
 * by walking alone.
 */

export interface QuizPanelProps {
  pack: GamePack;
  state: GameState;
  questId: string;
  onAnswer: (choiceIndex: number) => void;
  onClose: () => void;
}

export function QuizPanel({ pack, state, questId, onAnswer, onClose }: QuizPanelProps) {
  const accent = pack.theme.palette.accent;
  const quest = pack.quests.find((q) => q.id === questId);
  const progress = state.quests.find((q) => q.quest_id === questId);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (!quest?.quiz) return null;

  const quiz = quest.quiz;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 45,
        width: 'min(620px, 92vw)',
        ...panelStyle(accent),
        padding: 18,
      }}
    >
      <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 6 }}>
        {quest.title} — Trial of Understanding
      </div>
      <div style={{ fontSize: 15, color: '#e6ecf5', lineHeight: 1.6 }}>{quiz.question}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {quiz.choices.map((choice, index) => (
          <button
            key={choice}
            type="button"
            style={{ ...buttonStyle(accent), textAlign: 'left' }}
            onClick={() => {
              const ok = index === quiz.correct;
              setFeedback({ ok, text: ok ? quiz.success_text : quiz.failure_text });
              if (ok) onAnswer(index);
            }}
          >
            {choice}
          </button>
        ))}
      </div>

      {feedback && (
        <div style={{ marginTop: 12, fontSize: 13, color: feedback.ok ? '#7fd1a8' : '#ff9b9b' }}>
          {feedback.text}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button type="button" style={buttonStyle('#8b98ad')} onClick={onClose}>
          {progress?.quiz_passed ? 'Continue' : 'Later'}
        </button>
      </div>
    </div>
  );
}
