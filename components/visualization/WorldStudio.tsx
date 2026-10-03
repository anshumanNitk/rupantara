'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { buildWorld } from '@/world/compiler';
import { WorldExplorer } from './WorldExplorer';
import { RepoInput } from './RepoInput';
import { RpgStudio } from '@/components/rpg/RpgStudio';

/**
 * World studio — owns the analyzed architecture and compiles it into a world.
 *
 * This is the client-side counterpart of the server pipeline. `buildWorld` is
 * pure and deterministic, so it runs identically in the browser: the same
 * Architecture Graph always produces the same city.
 *
 * The RPG explorer is the primary experience. The legacy technical city view
 * remains available as a developer/inspection mode until the RPG reaches
 * parity on provenance and repository coverage.
 *
 * The frontend never inspects repository source. It receives a validated
 * Architecture Graph from the analysis service and treats it as data.
 */

export interface WorldStudioProps {
  initialArchitecture: ArchitectureGraph;
  initialLabel: string;
  initialEvents: RuntimeEvent[];
}

type ViewMode = 'rpg' | 'city';

export function WorldStudio({ initialArchitecture, initialLabel, initialEvents }: WorldStudioProps) {
  const [architecture, setArchitecture] = useState<ArchitectureGraph>(initialArchitecture);
  const [label, setLabel] = useState(initialLabel);
  const [events, setEvents] = useState<RuntimeEvent[]>(initialEvents);
  const [analyzing, setAnalyzing] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('rpg');

  // Compilation is pure, so it is safe to derive during render.
  const compiled = useMemo(() => {
    try {
      return { result: buildWorld(architecture), error: null as string | null };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : 'Failed to compile the world.',
      };
    }
  }, [architecture]);

  const handleAnalyzed = useCallback((next: ArchitectureGraph, warnings: string[]) => {
    setCompileError(null);
    setArchitecture(next);
    setLabel(`${next.repository.owner ?? ''}/${next.repository.name}`.replace(/^\//, ''));
    // Runtime events are repository-specific; a newly analyzed repo starts clean.
    setEvents([]);
    void warnings;
  }, []);

  const handleReset = useCallback(() => {
    setArchitecture(initialArchitecture);
    setLabel(initialLabel);
    setEvents(initialEvents);
    setCompileError(null);
  }, [initialArchitecture, initialLabel, initialEvents]);

  const error = compileError ?? compiled.error;

  const repoInput = (
    <RepoInput
      onAnalyzed={handleAnalyzed}
      onReset={handleReset}
      analyzing={analyzing}
      setAnalyzing={setAnalyzing}
      currentRepoLabel={label}
    />
  );

  return (
    <>
      {compiled.result && !error ? (
        viewMode === 'rpg' ? (
          <RpgStudio
            architecture={compiled.result.architecture}
            placed={compiled.result.placed}
            initialEvents={events}
            repoInput={repoInput}
            onSwitchToCity={() => setViewMode('city')}
          />
        ) : (
          <>
            <WorldExplorer
              architecture={compiled.result.architecture}
              world={compiled.result.world}
              placed={compiled.result.placed}
              initialEvents={events}
            />
            <button
              type="button"
              onClick={() => setViewMode('rpg')}
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                zIndex: 40,
                padding: '8px 12px',
                borderRadius: 7,
                border: '1px solid #5b8def88',
                background: 'rgba(27,36,51,0.9)',
                color: '#9fd0ff',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Enter RPG World
            </button>
          </>
        )
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ff9b9b',
            fontSize: 14,
            padding: 40,
            textAlign: 'center',
          }}
        >
          {error ?? 'Compiling world…'}
        </div>
      )}

      {viewMode === 'rpg' ? null : repoInput}
    </>
  );
}