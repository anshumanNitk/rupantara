import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the Narrative Agent.
 *
 * The browser never talks to the Python service directly: the service URL stays
 * server-side. This route turns an Architecture Graph into a story — characters,
 * beats, missions, cutscenes and an ending — grounded in the architecture.
 *
 * The narrative is optional: if this route fails, the client falls back to a
 * deterministic story compiled from the architecture, so the world always has
 * soul.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_URL = process.env.ARCHITECTURE_SERVICE_URL ?? 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  let body: { architecture?: unknown; world_id?: unknown; theme?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body.architecture || typeof body.architecture !== 'object') {
    return NextResponse.json({ error: 'An architecture graph is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${SERVICE_URL}/projects/narrative/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        architecture: body.architecture,
        world_id: typeof body.world_id === 'string' ? body.world_id : null,
        theme: typeof body.theme === 'string' ? body.theme : null,
      }),
      // Story writing is a single model pass with up to two repairs.
      signal: AbortSignal.timeout(300_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : `Narrative service returned ${response.status}.`;
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isUnreachable =
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      (error instanceof Error && error.name === 'TimeoutError');

    return NextResponse.json(
      {
        error: isUnreachable
          ? `Could not reach the Narrative service at ${SERVICE_URL}.`
          : `Narrative generation failed: ${message}`,
      },
      { status: 502 },
    );
  }
}
