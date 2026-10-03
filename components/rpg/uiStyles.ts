import type { CSSProperties } from 'react';

/**
 * Shared RPG UI styling.
 *
 * One coherent HUD look, derived from the theme accent. Panels are dark,
 * compact and readable; the game world stays the focus.
 */

export function panelStyle(accent: string): CSSProperties {
  return {
    background: 'rgba(12, 16, 26, 0.92)',
    border: `1px solid ${accent}55`,
    borderRadius: 10,
    color: '#e6ecf5',
    fontSize: 13,
    boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
    backdropFilter: 'blur(4px)',
  };
}

export function buttonStyle(accent: string, disabled = false): CSSProperties {
  return {
    padding: '7px 12px',
    borderRadius: 7,
    border: `1px solid ${accent}88`,
    background: disabled ? 'rgba(20,27,38,0.6)' : 'rgba(27,36,51,0.9)',
    color: disabled ? '#5a6478' : accent,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
  };
}

export const HUD_FONT = '13px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
