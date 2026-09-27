'use client';

import type { PlacedEntity, PlacedWorld } from '@/world/schemas/world';

/**
 * Entity inspector — surfaces metadata and provenance for a selected entity.
 *
 * Provenance chain: 3D entity -> world entity -> architecture node -> repo source.
 */

export interface InspectorProps {
  world: PlacedWorld;
  entityId: string | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
      <span style={{ color: '#8b98ad', minWidth: 110 }}>{label}</span>
      <span style={{ color: '#e2e8f0', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

export function Inspector({ world, entityId, onClose }: InspectorProps) {
  if (entityId === null) return null;

  const entity: PlacedEntity | undefined = world.entities.find((e) => e.id === entityId);
  if (!entity) return null;

  const connections = world.connections.filter((c) => c.from === entity.id || c.to === entity.id);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 20,
        width: 340,
        maxHeight: '70vh',
        overflow: 'auto',
        background: '#0f141d',
        border: '1px solid #2b3445',
        borderRadius: 10,
        padding: 16,
        color: '#e2e8f0',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>{entity.id}</strong>
        <button
          type="button"
          onClick={onClose}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#8b98ad', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <Row label="Semantic type" value={entity.semantic_type} />
      <Row label="Archetype" value={entity.archetype} />
      <Row label="Primitive" value={entity.visual.primitive} />
      <Row label="Zone" value={entity.zone ?? '—'} />
      <Row label="Anchor" value={entity.spatial.anchor ?? '—'} />
      <Row
        label="Position"
        value={`${entity.resolved_position.x}, ${entity.resolved_position.y}, ${entity.resolved_position.z}`}
      />

      {Object.keys(entity.metadata).length > 0 && (
        <>
          <div style={{ marginTop: 12, marginBottom: 6, color: '#9fd0ff' }}>Metadata</div>
          {Object.entries(entity.metadata).map(([key, value]) => (
            <Row key={key} label={key} value={String(value)} />
          ))}
        </>
      )}

      {entity.provenance && (
        <>
          <div style={{ marginTop: 12, marginBottom: 6, color: '#9fd0ff' }}>Provenance</div>
          <Row label="Architecture node" value={entity.provenance.architecture_node_id} />
          {entity.provenance.source?.file && <Row label="File" value={entity.provenance.source.file} />}
          {entity.provenance.source?.symbol && <Row label="Symbol" value={entity.provenance.source.symbol} />}
        </>
      )}

      {connections.length > 0 && (
        <>
          <div style={{ marginTop: 12, marginBottom: 6, color: '#9fd0ff' }}>Connections</div>
          {connections.map((connection) => (
            <Row
              key={connection.id}
              label={connection.semantic_type}
              value={`${connection.from} → ${connection.to}`}
            />
          ))}
        </>
      )}
    </div>
  );
}