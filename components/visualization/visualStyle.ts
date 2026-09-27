/**
 * Visual style configuration.
 *
 * Style is independent from architecture. The same World Specification must be
 * renderable under multiple styles without touching the compiler or layout.
 */

export interface VisualStyle {
  id: string;
  label: string;
  background: string;
  ground: string;
  fog: { color: string; near: number; far: number };
  ambient: { intensity: number; color: string };
  directional: { intensity: number; color: string; position: [number, number, number] };
  accent: string;
  connectionColor: string;
  zoneOpacity: number;
  showZones: boolean;
  camera: 'isometric' | 'perspective' | 'top';
}

export const VISUAL_STYLES: Record<string, VisualStyle> = {
  stylized_futuristic: {
    id: 'stylized_futuristic',
    label: 'Stylized Futuristic',
    background: '#0b0f16',
    ground: '#141b26',
    fog: { color: '#0b0f16', near: 80, far: 320 },
    ambient: { intensity: 0.55, color: '#9fd0ff' },
    directional: { intensity: 1.1, color: '#ffffff', position: [60, 90, 40] },
    accent: '#5b8def',
    connectionColor: '#3a4658',
    zoneOpacity: 0.06,
    showZones: true,
    camera: 'isometric',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    background: '#f7f8fa',
    ground: '#e8eaee',
    fog: { color: '#f7f8fa', near: 120, far: 400 },
    ambient: { intensity: 0.9, color: '#ffffff' },
    directional: { intensity: 0.7, color: '#ffffff', position: [40, 80, 30] },
    accent: '#4a5568',
    connectionColor: '#cbd5e0',
    zoneOpacity: 0.04,
    showZones: false,
    camera: 'isometric',
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    background: '#1a1614',
    ground: '#2a2420',
    fog: { color: '#1a1614', near: 70, far: 280 },
    ambient: { intensity: 0.4, color: '#ffb87a' },
    directional: { intensity: 1.0, color: '#ffd9a0', position: [50, 70, 50] },
    accent: '#c97b3c',
    connectionColor: '#4a3f36',
    zoneOpacity: 0.08,
    showZones: true,
    camera: 'perspective',
  },
  cartoon: {
    id: 'cartoon',
    label: 'Cartoon',
    background: '#bfe3ff',
    ground: '#8fd18f',
    fog: { color: '#bfe3ff', near: 100, far: 380 },
    ambient: { intensity: 1.0, color: '#ffffff' },
    directional: { intensity: 0.9, color: '#fff6d5', position: [60, 100, 40] },
    accent: '#ff8a5b',
    connectionColor: '#6b7280',
    zoneOpacity: 0.1,
    showZones: true,
    camera: 'isometric',
  },
  clean_technical: {
    id: 'clean_technical',
    label: 'Clean Technical',
    background: '#ffffff',
    ground: '#f0f2f5',
    fog: { color: '#ffffff', near: 150, far: 450 },
    ambient: { intensity: 0.95, color: '#ffffff' },
    directional: { intensity: 0.6, color: '#ffffff', position: [30, 100, 30] },
    accent: '#2563eb',
    connectionColor: '#94a3b8',
    zoneOpacity: 0.05,
    showZones: true,
    camera: 'top',
  },
};

export const DEFAULT_STYLE_ID = 'stylized_futuristic';

export function resolveStyle(id: string): VisualStyle {
  return VISUAL_STYLES[id] ?? VISUAL_STYLES[DEFAULT_STYLE_ID]!;
}