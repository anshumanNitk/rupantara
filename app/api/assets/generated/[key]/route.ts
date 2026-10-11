import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Serves a content-addressed generated image from `.cache/generated`.
 *
 * This is the only public URL for generated art. Nothing is written under
 * `public/`, so the Next static file server never ships model output.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'generated');
const KEY_PATTERN = /^[a-f0-9]{16,64}$/i;

export async function GET(
  _request: Request,
  context: { params: { key: string } },
) {
  const key = context.params.key?.replace(/\.png$/i, '') ?? '';
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ ok: false, error: 'Invalid cache key.' }, { status: 400 });
  }

  const filePath = path.join(CACHE_DIR, `${key}.png`);
  try {
    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }
}
