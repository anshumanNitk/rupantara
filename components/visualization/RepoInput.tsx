'use client';

import { useCallback, useState } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';

/**
 * Repository input panel.
 *
 * Paste a public GitHub URL (or `owner/name` shorthand), analyze it, and the
 * resulting Architecture Graph is handed to the parent, which compiles it into
 * a world and renders it. The frontend never inspects repository source itself.
 */

export interface RepoInputProps {
  onAnalyzed: (architecture: ArchitectureGraph, warnings: string[]) => void;
  onReset: () => void;
  analyzing: boolean;
  setAnalyzing: (value: boolean) => void;
  currentRepoLabel: string;
}

const EXAMPLES = [
  'https://github.com/tiangolo/fastapi',
  'https://github.com/expressjs/express',
  'https://github.com/pallets/flask',
];

export function RepoInput({
  onAnalyzed,
  onReset,
  analyzing,
  setAnalyzing,
  currentRepoLabel,
}: RepoInputProps) {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Paste a repository URL first.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, branch: branch.trim() || null }),
      });

      const payload = (await response.json()) as
        | { architecture: ArchitectureGraph; warnings?: string[] }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        setError('error' in payload ? payload.error : `Request failed (${response.status}).`);
        return;
      }

      setWarnings(payload.warnings ?? []);
      onAnalyzed(payload.architecture, payload.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setAnalyzing(false);
    }
  }, [url, branch, onAnalyzed, setAnalyzing]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 30,
        width: 340,
        background: '#0f141d',
        border: '1px solid #2b3445',
        borderRadius: 10,
        padding: 14,
        color: '#e2e8f0',
        fontSize: 13,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Analyze a repository</div>
      <div style={{ color: '#8b98ad', fontSize: 11, marginBottom: 10 }}>
        Paste a public GitHub link to generate its 3D world
      </div>

      <input
        type="text"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !analyzing) void handleAnalyze();
        }}
        placeholder="https://github.com/owner/repo"
        disabled={analyzing}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid #2b3445',
          background: '#141b26',
          color: '#e2e8f0',
          fontSize: 12,
          marginBottom: 8,
        }}
      />

      <input
        type="text"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
        placeholder="branch (optional)"
        disabled={analyzing}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid #2b3445',
          background: '#141b26',
          color: '#e2e8f0',
          fontSize: 12,
          marginBottom: 10,
        }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={analyzing}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #5b8def',
            background: analyzing ? '#141b26' : '#1b2433',
            color: analyzing ? '#4a5568' : '#9fd0ff',
            cursor: analyzing ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </button>
        <button
          type="button"
          onClick={() => {
            setUrl('');
            setBranch('');
            setError(null);
            setWarnings([]);
            onReset();
          }}
          disabled={analyzing}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #2b3445',
            background: '#141b26',
            color: '#8b98ad',
            cursor: analyzing ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          Reset
        </button>
      </div>

      {analyzing && (
        <div style={{ marginTop: 10, color: '#9fd0ff', fontSize: 11, lineHeight: 1.5 }}>
          Fetching repository and running the Architecture Agent. This can take up to a minute.
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#2a1518',
            border: '1px solid #5c2b2b',
            color: '#ff9b9b',
            fontSize: 11,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#2a2415',
            border: '1px solid #5c4f2b',
            color: '#f5c451',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {warnings.map((warning) => (
            <div key={warning}>• {warning}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, color: '#4a5568', fontSize: 11 }}>
        Showing: <span style={{ color: '#8b98ad' }}>{currentRepoLabel}</span>
      </div>

      {!analyzing && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setUrl(example)}
              style={{
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid #2b3445',
                background: 'transparent',
                color: '#8b98ad',
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {example.replace('https://github.com/', '')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}