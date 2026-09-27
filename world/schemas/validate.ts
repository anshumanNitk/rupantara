import type { z } from 'zod';

export interface ValidationResult<T> {
  ok: boolean;
  data: T | null;
  errors: string[];
}

/**
 * Validates unknown input against a zod schema and then runs optional
 * structural checks. Malformed AI output is rejected here, never downstream.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
  structural?: (value: T) => string[],
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      data: null,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    };
  }

  const structuralErrors = structural ? structural(parsed.data) : [];
  if (structuralErrors.length > 0) {
    return { ok: false, data: null, errors: structuralErrors };
  }

  return { ok: true, data: parsed.data, errors: [] };
}

/** Throwing variant for use inside compilers where invalid input is a bug. */
export function validateOrThrow<T>(
  schema: z.ZodType<T>,
  input: unknown,
  structural?: (value: T) => string[],
  label = 'input',
): T {
  const result = validate(schema, input, structural);
  if (!result.ok || result.data === null) {
    throw new Error(`Invalid ${label}:\n  - ${result.errors.join('\n  - ')}`);
  }
  return result.data;
}