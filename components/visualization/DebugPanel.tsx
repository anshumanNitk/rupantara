'use client';

import { useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { WorldSpecification, PlacedWorld } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';

/**
 * Debug panel — makes the whole pipeline inspectable.
 *
 * Shows every stage of the pipeline so the system is understandable and
 * debuggable: architecture graph, world spec, placed world, runtime events,
 * validation errors and provenance.
 */

export interface DebugPanelProps {
  architecture: ArchitectureGraph | null;
  world: WorldSpecification | null;
  placed: PlacedWorld | null;
  events: RuntimeEvent[];
  errors: string[];
  sceneCode: string | null;
}

type Tab = 'architecture' | 'world' | 'placed' | 'events' | 'scene' | 'errors';

const TABS: { id: Tab; label: string }[] = [
  { id: 'architecture', label: 'Architecture' },
  { id: 'world', label: 'World Spec' },
  { id: 'placed', label: 'Placed World' },
  { id: 'events', label: 'Events' },
  { id: 'scene', label: 'Scene Code' },
  { id: 'errors', label: 'Errors' },
];

export function DebugPanel({ architecture, world, placed, events, errors, sceneCode }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('architecture');

  const payload: Record<Tab, unknown> = {
    architecture,
    world,
    placed,
    events,
    scene: sceneCode,
    errors,
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 20,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid #2b3445',
          background: '#141b26',
          color: '#e2e8f0',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 20,
        width: 520,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f141d',
        border: '1px solid #2b3445',
        borderRadius: 10,
        color: '#e2e8f0',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 8, borderBottom: '1px solid #2b3445', flexWrap: 'wrap' }}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid ' + (tab === entry.id ? '#5b8def' : 'transparent'),
              background: tab === entry.id ? '#1b2433' : 'transparent',
              color: tab === entry.id ? '#9fd0ff' : '#8b98ad',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {entry.label}
            {entry.id === 'errors' && errors.length > 0 ? ` (${errors.length})` : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#8b98ad', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <pre
        style={{
          margin: 0,
          padding: 12,
          overflow: 'auto',
          maxHeight: '60vh',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
        }}
      >
        {tab === 'errors' && errors.length === 0
          ? 'No validation errors.'
          : JSON.stringify(payload[tab], null, 2)}
      </pre>
    </div>
  );
}