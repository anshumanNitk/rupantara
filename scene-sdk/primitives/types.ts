import type { ReactNode } from 'react';
import type { Vec3 } from '@/world/schemas/world';

/**
 * Scene SDK — shared prop contracts.
 *
 * Every SDK primitive accepts the same base props so the renderer can treat
 * them uniformly. The SDK is stable infrastructure: the Scene Agent may only
 * compose these components, never invent new ones.
 */

export interface SceneTransform {
  position?: Vec3;
  rotation?: Vec3;
  scale?: number;
}

export interface SceneEntityProps extends SceneTransform {
  /** Visual state driven by the runtime event system. */
  state?: 'idle' | 'active' | 'success' | 'failure' | 'highlighted';
  /** Arbitrary metadata, surfaced in the inspector. */
  metadata?: Record<string, unknown>;
  /** Accent colour. Styles may override this. */
  color?: string;
  /** Click handler wired by the renderer for entity inspection. */
  onSelect?: () => void;
  children?: ReactNode;
}

export interface SceneConnectionProps {
  /** Routed path in world coordinates. */
  path: Vec3[];
  color?: string;
  width?: number;
  opacity?: number;
  animated?: boolean;
  onSelect?: () => void;
}

export const DEFAULT_ACCENT = '#5b8def';
export const SUCCESS_ACCENT = '#3ecf8e';
export const FAILURE_ACCENT = '#ef5b5b';
export const HIGHLIGHT_ACCENT = '#f5c451';

export function stateColor(state: SceneEntityProps['state'], fallback: string): string {
  switch (state) {
    case 'active':
      return HIGHLIGHT_ACCENT;
    case 'success':
      return SUCCESS_ACCENT;
    case 'failure':
      return FAILURE_ACCENT;
    case 'highlighted':
      return HIGHLIGHT_ACCENT;
    default:
      return fallback;
  }
}