'use client';

import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { PlacedWorld } from '@/world/schemas/world';
import { panelStyle, buttonStyle } from './uiStyles';

/**
 * Developer drawer.
 *
 * Opt-in access to the raw architecture/world data and the compiled pack. It is
 * never shown during normal play, so debug information never competes with the
 * game UI.
 */

export interface DeveloperDrawerProps {
  pack: GamePack;
  state: GameState;
  architecture: ArchitectureGraph;
  placed: PlacedWorld;
  onClose: () => void;
}

export function DeveloperDrawer({ pack, state, architecture, placed, onClose }: DeveloperDrawerProps) {
  const accent = pack.theme.palette.accent;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '46vh',
        zIndex: 60,
        ...panelStyle(accent),
        borderRadius: 0,
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>Developer</div>
        <button type="button" style={buttonStyle(accent)} onClick={onClose}>Close</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
        <Stat label="World fingerprint" value={pack.world.fingerprint} />
        <Stat label="Seed" value={String(pack.world.seed)} />
        <Stat label="Map" value={`${pack.map.width} × ${pack.map.height} tiles`} />
        <Stat label="Landmarks" value={String(pack.landmarks.length)} />
        <Stat label="NPCs" value={String(pack.npcs.length)} />
        <Stat label="Quests" value={String(pack.quests.length)} />
        <Stat label="Architecture nodes" value={String(architecture.nodes.length)} />
        <Stat label="Placed entities" value={String(placed.entities.length)} />
        <Stat label="Player tile" value={`${state.player.position.x}, ${state.player.position.y}`} />
        <Stat label="Unlocks" value={state.unlocks.join(', ') || '—'} />
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', color: '#9aa7b8' }}>Raw GamePack</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#c7d2e0' }}>
          {JSON.stringify(pack, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #2b3445', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: '#9aa7b8', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{value}</div>
    </div>
  );
}
