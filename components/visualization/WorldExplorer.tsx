'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { WorldSpecification, PlacedWorld } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { WorldCanvas } from './WorldCanvas';
import { Inspector } from './Inspector';
import { DebugPanel } from './DebugPanel';
import { Toolbar } from './Toolbar';
import { VISUAL_STYLES, DEFAULT_STYLE_ID, resolveStyle } from './visualStyle';

/**
 * World explorer — the interactive shell around the canvas.
 *
 * Owns UI state only (selection, filters, style, event playback). All world
 * data arrives as props from the server, already compiled and laid out.
 */

export interface WorldExplorerProps {
  architecture: ArchitectureGraph;
  world: WorldSpecification;
  placed: PlacedWorld;
  initialEvents: RuntimeEvent[];
}

export function WorldExplorer({ architecture, world, placed, initialEvents }: WorldExplorerProps) {
  const [styleId, setStyleId] = useState(DEFAULT_STYLE_ID);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [visibleZones, setVisibleZones] = useState<Set<string> | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string> | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [playing, setPlaying] = useState(false);

  const style = useMemo(() => resolveStyle(styleId), [styleId]);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (placed.entities.length !== world.entities.length) {
      list.push('Placed entity count does not match world entity count');
    }
    return list;
  }, [placed, world]);

  const handleReplay = useCallback(() => {
    setEvents([]);
    setPlaying(true);
    // Feed events in one batch; the runtime layer animates them concurrently.
    setEvents(initialEvents);
  }, [initialEvents]);

  const handleReset = useCallback(() => {
    setEvents([]);
    setPlaying(false);
    setSelectedEntityId(null);
    setVisibleZones(null);
    setVisibleTypes(null);
    setResetSignal((n) => n + 1);
  }, []);

  const toggleZone = useCallback((zoneId: string) => {
    setVisibleZones((current) => {
      const base = current ?? new Set(placed.zones.map((z) => z.id));
      const next = new Set(base);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next.size === placed.zones.length ? null : next;
    });
  }, [placed.zones]);

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((current) => {
      const all = new Set(placed.entities.map((e) => e.semantic_type));
      const base = current ?? all;
      const next = new Set(base);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next.size === all.size ? null : next;
    });
  }, [placed.entities]);

  const semanticTypes = useMemo(
    () => [...new Set(placed.entities.map((e) => e.semantic_type))].sort(),
    [placed.entities],
  );

  return (
    <>
      <WorldCanvas
        world={placed}
        style={style}
        events={events}
        selectedEntityId={selectedEntityId}
        visibleZones={visibleZones}
        visibleTypes={visibleTypes}
        resetSignal={resetSignal}
        onSelectEntity={setSelectedEntityId}
      />

      <Toolbar
        worldName={world.world.name}
        styleId={styleId}
        styles={Object.values(VISUAL_STYLES)}
        zones={placed.zones.map((z) => ({ id: z.id, label: z.label }))}
        types={semanticTypes}
        visibleZones={visibleZones}
        visibleTypes={visibleTypes}
        playing={playing}
        hasEvents={initialEvents.length > 0}
        onStyleChange={setStyleId}
        onToggleZone={toggleZone}
        onToggleType={toggleType}
        onReplay={handleReplay}
        onReset={handleReset}
      />

      <Inspector world={placed} entityId={selectedEntityId} onClose={() => setSelectedEntityId(null)} />

      <DebugPanel
        architecture={architecture}
        world={world}
        placed={placed}
        events={events}
        errors={errors}
        sceneCode={null}
      />
    </>
  );
}