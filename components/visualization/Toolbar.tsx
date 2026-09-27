'use client';

import type { VisualStyle } from './visualStyle';

/**
 * Toolbar — user interaction surface.
 *
 * Orbit/zoom/pan are handled by OrbitControls. This exposes the discrete
 * actions: style switching, zone/type filtering, workflow replay, camera reset.
 */

export interface ToolbarProps {
  worldName: string;
  styleId: string;
  styles: VisualStyle[];
  zones: { id: string; label: string }[];
  types: string[];
  visibleZones: Set<string> | null;
  visibleTypes: Set<string> | null;
  playing: boolean;
  hasEvents: boolean;
  onStyleChange: (styleId: string) => void;
  onToggleZone: (zoneId: string) => void;
  onToggleType: (type: string) => void;
  onReplay: () => void;
  onReset: () => void;
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 999,
  border: `1px solid ${active ? '#5b8def' : '#2b3445'}`,
  background: active ? '#1b2433' : 'transparent',
  color: active ? '#9fd0ff' : '#8b98ad',
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
});

export function Toolbar({
  worldName,
  styleId,
  styles,
  zones,
  types,
  visibleZones,
  visibleTypes,
  playing,
  hasEvents,
  onStyleChange,
  onToggleZone,
  onToggleType,
  onReplay,
  onReset,
}: ToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 372,
        left: 16,
        zIndex: 20,
        width: 300,
        maxHeight: 'calc(100vh - 388px)',
        overflow: 'auto',
        background: '#0f141d',
        border: '1px solid #2b3445',
        borderRadius: 10,
        padding: 14,
        color: '#e2e8f0',
        fontSize: 13,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{worldName}</div>
      <div style={{ color: '#8b98ad', fontSize: 11, marginBottom: 12 }}>
        Architecture → World → Layout → Scene
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9fd0ff', marginBottom: 6, fontSize: 12 }}>Visual style</div>
        <select
          value={styleId}
          onChange={(event) => onStyleChange(event.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #2b3445',
            background: '#141b26',
            color: '#e2e8f0',
            fontSize: 12,
          }}
        >
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9fd0ff', marginBottom: 6, fontSize: 12 }}>Zones</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => onToggleZone(zone.id)}
              style={chipStyle(visibleZones === null || visibleZones.has(zone.id))}
            >
              {zone.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#9fd0ff', marginBottom: 6, fontSize: 12 }}>Types</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              style={chipStyle(visibleTypes === null || visibleTypes.has(type))}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onReplay}
          disabled={!hasEvents}
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 6,
            border: '1px solid #2b3445',
            background: hasEvents ? '#1b2433' : '#141b26',
            color: hasEvents ? '#9fd0ff' : '#4a5568',
            cursor: hasEvents ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
        >
          {playing ? 'Replay workflow' : 'Play workflow'}
        </button>
        <button
          type="button"
          onClick={onReset}
          style={{
            padding: '7px 10px',
            borderRadius: 6,
            border: '1px solid #2b3445',
            background: '#141b26',
            color: '#8b98ad',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: 12, color: '#4a5568', fontSize: 11, lineHeight: 1.5 }}>
        Drag to orbit · scroll to zoom · right-drag to pan · click an entity to inspect
      </div>
    </div>
  );
}