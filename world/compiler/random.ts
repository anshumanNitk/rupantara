/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Same seed -> same sequence, on every platform. This is what makes the
 * layout reproducible: no Math.random() anywhere in the pipeline.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic float in [min, max). */
export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Rounds to 4 decimals so serialized output is stable and diff-friendly. */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}