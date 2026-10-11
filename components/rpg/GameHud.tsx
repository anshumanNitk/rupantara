'use client';

import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import { activeQuest, nextObjective } from '@/game/runtime/gameState';
import type { Interactable } from './interactionSystem';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Game HUD.
 *
 * Shows only what matters during play: the current quest, its next objective,
 * and the interaction prompt. Debug data lives behind the developer drawer.
 */

export interface GameHudProps {
  pack: GamePack;
  state: GameState;
  nearby: Interactable | null;
  onInteract: () => void;
  onOpenQuestLog: () => void;
  onOpenCodex: () => void;
  onOpenMissions: () => void;
  onOpenCharacters: () => void;
  onOpenDeveloper: () => void;
  onSwitchToCity: () => void;
  onReset: () => void;
}

export function GameHud({
  pack,
  state,
  nearby,
  onInteract,
  onOpenQuestLog,
  onOpenCodex,
  onOpenMissions,
  onOpenCharacters,
  onOpenDeveloper,
  onSwitchToCity,
  onReset,
}: GameHudProps) {
  const accent = pack.theme.palette.accent;
  const quest = activeQuest(pack, state);
  const objective = quest ? nextObjective(pack, state, quest.id) : null;

  return (
    <>
      {/* Title / world identity */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          ...panelStyle(accent),
          padding: '10px 18px',
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{pack.theme.label}</div>
        <div style={{ fontSize: 11, color: '#9aa7b8', marginTop: 2 }}>{pack.world.name}</div>
        {pack.theme.tagline && (
          <div style={{ fontSize: 11, color: '#7f8ba0', marginTop: 6, fontStyle: 'italic' }}>{pack.theme.tagline}</div>
        )}
      </div>

      {/* Quest tracker */}
      {quest && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20, ...panelStyle(accent), padding: '10px 14px', width: 260 }}>
          <div style={{ fontSize: 11, color: '#9aa7b8', textTransform: 'uppercase', letterSpacing: 0.6 }}>Current Quest</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{quest.title}</div>
          {objective && (
            <div style={{ fontSize: 12, color: '#c7d2e0', marginTop: 6 }}>• {objective.description}</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" style={buttonStyle(accent)} onClick={onOpenMissions}>Missions</button>
            <button type="button" style={buttonStyle(accent)} onClick={onOpenCharacters}>Characters</button>
            <button type="button" style={buttonStyle(accent)} onClick={onOpenQuestLog}>Quest Log</button>
            <button type="button" style={buttonStyle(accent)} onClick={onOpenCodex}>Codex</button>
          </div>
        </div>
      )}

      {/* Interaction prompt */}
      {nearby && (
        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            ...panelStyle(accent),
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: '#c7d2e0' }}>
            {nearby.kind === 'npc' ? `Talk to ${nearby.label}` : `Inspect ${nearby.label}`}
          </span>
          <button type="button" style={buttonStyle(accent)} onClick={onInteract}>
            E
          </button>
        </div>
      )}

      {/* Controls hint + developer toggle */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20, ...panelStyle(accent), padding: '8px 12px', fontSize: 11, color: '#9aa7b8' }}>
        <div>Move: WASD / Arrows · Interact: E</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" style={buttonStyle(accent)} onClick={onOpenDeveloper}>Developer</button>
          <button type="button" style={buttonStyle(accent)} onClick={onSwitchToCity}>City View</button>
          <button type="button" style={buttonStyle(accent)} onClick={onReset}>Reset</button>
        </div>
      </div>
    </>
  );
}
