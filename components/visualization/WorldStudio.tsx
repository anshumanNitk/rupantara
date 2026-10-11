'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import type { NarrativeGraph } from '@/game/schemas/narrative';
import { NarrativeGraphSchema } from '@/game/schemas/narrative';
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
  const [narrative, setNarrative] = useState<NarrativeGraph | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

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

  // Fetch a story for the current architecture. The Narrative Agent gives the
  // world its soul; if it is unavailable the client compiles a deterministic
  // fallback story, so this is best-effort and never blocks play.
  useEffect(() => {
    let cancelled = false;
    setNarrative(null);
    setNarrativeLoading(true);

    void (async () => {
      try {
        const response = await fetch('/api/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ architecture }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { narrative?: unknown };
        const parsed = NarrativeGraphSchema.safeParse(payload.narrative);
        if (!cancelled && parsed.success) setNarrative(parsed.data);
      } catch {
        // Best-effort: the deterministic fallback story covers this case.
      } finally {
        if (!cancelled) setNarrativeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
            narrative={narrative}
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