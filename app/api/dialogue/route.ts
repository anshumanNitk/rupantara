import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the Dialogue Agent.
 *
 * The browser sends the NPC's persona and the facts it is allowed to state; the
 * model returns prose only. The service URL stays server-side.
 *
 * Dialogue is optional: if this route fails, the client falls back to the
 * scripted dialogue tree, so conversation always works.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_URL = process.env.ARCHITECTURE_SERVICE_URL ?? 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  let body: {
    name?: unknown;
    world_name?: unknown;
    persona?: unknown;
    motivation?: unknown;
    facts?: unknown;
    history?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'An NPC name is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${SERVICE_URL}/projects/dialogue/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        world_name: typeof body.world_name === 'string' ? body.world_name : 'the realm',
        persona: typeof body.persona === 'string' ? body.persona : null,
        motivation: typeof body.motivation === 'string' ? body.motivation : null,
        facts: Array.isArray(body.facts) ? body.facts.filter((f) => typeof f === 'string') : [],
        history: Array.isArray(body.history) ? body.history : [],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : `Dialogue service returned ${response.status}.`;
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
          ? `Could not reach the Dialogue service at ${SERVICE_URL}.`
          : `Dialogue generation failed: ${message}`,
      },
      { status: 502 },
    );
  }
}
