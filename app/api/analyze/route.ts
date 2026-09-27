import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the Architecture Intelligence service.
 *
 * The browser never talks to the Python service directly: the service URL stays
 * server-side, and this route is the single integration point. It also lets us
 * normalise errors into a stable shape for the UI.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_URL = process.env.ARCHITECTURE_SERVICE_URL ?? 'http://127.0.0.1:8000';

export interface AnalyzeUrlBody {
  url?: unknown;
  branch?: unknown;
}

export async function POST(request: Request) {
  let body: AnalyzeUrlBody;

  try {
    body = (await request.json()) as AnalyzeUrlBody;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'A repository URL is required.' }, { status: 400 });
  }

  const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : null;

  try {
    const response = await fetch(`${SERVICE_URL}/projects/analyze-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, branch }),
      // Analysis fetches the repository and calls the model, with a repair
      // retry on invalid output. Two model passes plus a tarball download can
      // exceed 3 minutes, so allow a generous ceiling well above that.
      signal: AbortSignal.timeout(600_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : `Analysis service returned ${response.status}.`;

      // 429 is transient and retryable — pass it through so the UI can say so.
      return NextResponse.json(
        { error: detail, retryable: response.status === 429 },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The most common failure by far is the Python service not running.
    const isUnreachable =
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      error instanceof Error && error.name === 'TimeoutError';

    return NextResponse.json(
      {
        error: isUnreachable
          ? `Could not reach the Architecture Intelligence service at ${SERVICE_URL}. Is it running?`
          : `Analysis failed: ${message}`,
      },
      { status: 502 },
    );
  }
}