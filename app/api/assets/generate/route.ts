import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Server-side image generation route.
 *
 * This is the "generate it" link in the asset provider chain. It is deliberately
 * model-agnostic: the provider is selected by env, and the route's contract is
 * simply `prompt -> image URL`.
 *
 * KEY PROPERTIES
 * --------------
 * 1. SERVER-SIDE ONLY. The API key never reaches the browser.
 * 2. CONTENT-ADDRESSED CACHE. The cache key is a hash of (prompt + model +
 *    size + style). The same request is only generated once, which is what
 *    keeps a "deterministic pack" compatible with a non-deterministic model:
 *    the pack stores the asset id, and the bytes are cached by content.
 * 3. FAILS SOFT. Any error returns a 200 with `{ ok: false }` so the client
 *    resolver falls through to the next provider (procedural/placeholder).
 *
 * Bytes live in `.cache/generated/<hash>.png` (never `public/`) and are served
 * by GET `/api/assets/generated/<hash>`. The pack stores the API URL, not a
 * static file path, so generated art is appearance-only and never ships as
 * public assets.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'generated');

interface GenerateBody {
  prompt?: unknown;
  style?: unknown;
  size?: unknown;
  theme?: unknown;
}

/** A locked style contract keeps independent generations visually consistent. */
function stylePrefix(theme: string | null): string {
  const base =
    '2.5D pixel-art game asset, warm fantasy palette, clean silhouette, ' +
    'consistent outline weight, transparent background, centered, no text';
  return theme ? `${base}, ${theme} theme` : base;
}

function cacheKey(prompt: string, model: string, size: string, style: string): string {
  return createHash('sha256').update(`${model}|${size}|${style}|${prompt}`).digest('hex').slice(0, 32);
}

/**
 * Calls the configured image provider. Returns a base64 PNG/JPEG or null.
 *
 * The provider is selected by `IMAGE_PROVIDER`:
 *   - "openrouter" -> OpenRouter image models (default: Google Nano Banana 2 /
 *                     Gemini 3.1 Flash Image). Uses the SAME OPENROUTER_API_KEY
 *                     as the agents, so no extra key is needed.
 *   - "gemini"     -> Google Generative Language API directly (needs GOOGLE_API_KEY)
 *   - "none"       -> disabled; the route reports `ok: false` so the chain falls through
 *
 * The exact model id is configurable via `IMAGE_MODEL` so a model rename is a
 * config change, never a code change.
 */
async function callImageProvider(prompt: string, size: string): Promise<{ data: string; mime: string } | null> {
  const provider = (process.env.IMAGE_PROVIDER ?? 'openrouter').toLowerCase();
  if (provider === 'none') return null;

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY ?? '';
    if (!apiKey) return null;

    const model = process.env.IMAGE_MODEL ?? 'google/gemini-3.1-flash-image';
    const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME) headers['X-Title'] = process.env.OPENROUTER_APP_NAME;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: {
        message?: {
          images?: { image_url?: { url?: string } }[];
        };
      }[];
    };
    const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return null;

    // OpenRouter returns a data URL: "data:image/png;base64,....".
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(url);
    if (!match) return null;
    return { data: match[2]!, mime: match[1]! };
  }

  if (provider === 'gemini') {
    const apiKey = process.env.IMAGE_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    if (!apiKey) return null;

    const model = process.env.IMAGE_MODEL ?? 'gemini-3.1-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    };
    const part = payload.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) return null;
    return { data: part.inlineData.data, mime: part.inlineData.mimeType ?? 'image/png' };
  }

  return null;
}

export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'A prompt is required.' }, { status: 400 });
  }

  const theme = typeof body.theme === 'string' ? body.theme : null;
  const size = typeof body.size === 'string' ? body.size : '512x512';
  const model = process.env.IMAGE_MODEL ?? 'google/gemini-3.1-flash-image';
  const style = stylePrefix(theme);
  const fullPrompt = `${style}. ${prompt}`;
  const key = cacheKey(fullPrompt, model, size, style);

  const filePath = path.join(CACHE_DIR, `${key}.png`);
  const publicUrl = `/api/assets/generated/${key}`;

  // 1. Cache hit — the same request is never generated twice.
  try {
    await fs.access(filePath);
    return NextResponse.json({ ok: true, url: publicUrl, cached: true, key });
  } catch {
    // Cache miss: fall through to generation.
  }

  // 2. Generate.
  try {
    const image = await callImageProvider(fullPrompt, size);
    if (!image) {
      // Provider disabled or unavailable: fail soft so the chain falls through.
      return NextResponse.json({ ok: false, reason: 'provider-unavailable' });
    }

    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(filePath, Buffer.from(image.data, 'base64'));

    return NextResponse.json({ ok: true, url: publicUrl, cached: false, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Never 500: the resolver treats this as "no generated asset".
    return NextResponse.json({ ok: false, reason: 'generation-failed', error: message });
  }
}
