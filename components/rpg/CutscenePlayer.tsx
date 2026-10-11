'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NarrativeGraph } from '@/game/schemas/narrative';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Cutscene player.
 *
 * Plays a narrative cutscene line by line. Lines are declarative data — a
 * speaker id and text — so the player never executes story-authored code. The
 * speaker's name is resolved from the narrative's characters.
 */

export interface CutscenePlayerProps {
  narrative: NarrativeGraph;
  cutsceneId: string;
  accent: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function CutscenePlayer({ narrative, cutsceneId, accent, onComplete, onSkip }: CutscenePlayerProps) {
  const cutscene = useMemo(
    () => narrative.cutscenes.find((c) => c.id === cutsceneId) ?? null,
    [narrative.cutscenes, cutsceneId],
  );
  const [index, setIndex] = useState(0);

  const nameOf = useCallback(
    (speakerId: string | null | undefined): string => {
      if (!speakerId) return 'Narrator';
      return narrative.characters.find((c) => c.id === speakerId)?.name ?? 'Narrator';
    },
    [narrative.characters],
  );

  const advance = useCallback(() => {
    if (!cutscene) return;
    if (index + 1 >= cutscene.lines.length) {
      onComplete();
    } else {
      setIndex((i) => i + 1);
    }
  }, [cutscene, index, onComplete]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'KeyE') {
        event.preventDefault();
        advance();
      }
      if (event.code === 'Escape') onSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, onSkip]);

  if (!cutscene || cutscene.lines.length === 0) {
    return null;
  }

  const line = cutscene.lines[index]!;
  const isLast = index + 1 >= cutscene.lines.length;

  return (
    <div
      onClick={advance}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'rgba(6, 9, 16, 0.82)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 0 8vh',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: accent, opacity: 0.8 }}>
          {cutscene.title}
        </div>
      </div>

      <div style={{ width: 'min(760px, 92vw)', ...panelStyle(accent), padding: 22 }}>
        <div style={{ fontSize: 12, color: accent, fontWeight: 700, marginBottom: 8 }}>
          {nameOf(line.speaker_id)}
        </div>
        <div style={{ fontSize: 17, lineHeight: 1.7, color: '#eef2f8' }}>{line.text}</div>
        {line.direction && (
          <div style={{ fontSize: 11, color: '#7f8ba0', fontStyle: 'italic', marginTop: 10 }}>
            ({line.direction})
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <div style={{ fontSize: 11, color: '#7f8ba0' }}>
            {index + 1} / {cutscene.lines.length} · Space or click to continue
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={buttonStyle(accent)}
              onClick={(e) => {
                e.stopPropagation();
                advance();
              }}
            >
              {isLast ? 'Begin' : 'Next'}
            </button>
            <button
              type="button"
              style={buttonStyle('#8b98ad')}
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
