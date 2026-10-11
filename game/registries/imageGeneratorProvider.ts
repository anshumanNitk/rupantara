import { GeneratorProvider, type AssetRequest, type ResolvedBody } from './assetResolver';

/**
 * Image-generation provider.
 *
 * This is the "generate it" link in the asset chain. It calls the server-side
 * `/api/assets/generate` route (which owns the API key and the content-addressed
 * cache) and returns a `generated` resolution, or null to fall through.
 *
 * It is deliberately thin: all the hard parts — key safety, caching, style
 * consistency, failing soft — live on the server. The client only decides
 * *whether* to ask.
 */

export interface ImageGeneratorOptions {
  /** Only generate for requests that look distinctive (avoid generating everything). */
  minRefLength?: number;
  /** Optional theme id, forwarded so the server can lock the style. */
  theme?: string;
  /** Optional size hint. */
  size?: string;
}

/** A request is worth generating only if it is specific enough to be distinctive. */
function isDistinctive(req: AssetRequest, minRefLength: number): boolean {
  // An explicit opt-in always generates.
  if (req.generate) return true;
  const ref = req.ref ?? '';
  if (ref.length < minRefLength) return false;
  // Generic single words are better served by procedural geometry.
  return ref.trim().split(/\s+/).length >= 2;
}

export function createImageGeneratorProvider(options: ImageGeneratorOptions = {}): GeneratorProvider {
  const minRefLength = options.minRefLength ?? 8;

  return new GeneratorProvider('image-gen', async (req: AssetRequest): Promise<ResolvedBody | null> => {
    if (!isDistinctive(req, minRefLength)) return null;

    // Build a role-specific prompt. Generated images are appearance only: the
    // map, collision and quest targets remain entirely deterministic.
    const subject = req.ref ?? req.primitive ?? 'building';
    const subjectPrompt = req.kind === 'character'
      ? `A single full-body RPG character: ${subject}. Three-quarter view, expressive face, clear silhouette, centered, no text, no props that hide the body.`
      : `A single ${subject} building for a 2.5D fantasy RPG town, isometric view, low-poly, centered, no text, no people.`;
    const prompt =
      `${subjectPrompt} Warm palette and clean silhouette. ` +
      `The background must be a single flat solid colour (pure magenta #FF00FF) ` +
      `with no checkerboard, no grid, no pattern, no shadow on the background.`;
    try {
      const response = await fetch('/api/assets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          theme: req.theme ?? options.theme ?? null,
          size: options.size ?? '512x512',
        }),
      });

      if (!response.ok) return null;
      const payload = (await response.json()) as { ok?: boolean; url?: string; key?: string };
      if (!payload.ok || !payload.url) return null;

      return {
        kind: 'generated',
        uri: payload.url,
        assetId: payload.key ?? subject,
        prompt,
      };
    } catch {
      // Network failure: fall through to the next provider.
      return null;
    }
  });
}
