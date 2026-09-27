'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import { buildWorld } from '@/world/compiler';
import { WorldExplorer } from './WorldExplorer';
import { RepoInput } from './RepoInput';

/**
 * World studio — owns the analyzed architecture and compiles it into a world.
 *
 * This is the client-side counterpart of the server pipeline. `buildWorld` is
 * pure and deterministic, so it runs identically in the browser: the same
 * Architecture Graph always produces the same city.
 *
 * The frontend never inspects repository source. It receives a validated
 * Architecture Graph from the analysis service and treats it as data.
 */

export interface WorldStudioProps {
  initialArchitecture: ArchitectureGraph;
  initialLabel: string;
  initialEvents: RuntimeEvent[];
}

export function WorldStudio({ initialArchitecture, initialLabel, initialEvents }: WorldStudioProps) {
  const [architecture, setArchitecture] = useState<ArchitectureGraph>(initialArchitecture);
  const [label, setLabel] = useState(initialLabel);
  const [events, setEvents] = useState<RuntimeEvent[]>(initialEvents);
  const [analyzing, setAnalyzing] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

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

  return (
    <>
      {compiled.result && !error ? (
        <WorldExplorer
          architecture={compiled.result.architecture}
          world={compiled.result.world}
          placed={compiled.result.placed}
          initialEvents={events}
        />
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

      <RepoInput
        onAnalyzed={handleAnalyzed}
        onReset={handleReset}
        analyzing={analyzing}
        setAnalyzing={setAnalyzing}
        currentRepoLabel={label}
      />
    </>
  );
}