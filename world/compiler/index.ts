import type { ArchitectureGraph } from '../schemas/architecture';
import type { WorldSpecification, PlacedWorld } from '../schemas/world';
import { validateOrThrow } from '../schemas/validate';
import { ArchitectureGraphSchema, validateArchitectureGraph } from '../schemas/architecture';
import { WorldSpecificationSchema, validateWorldSpecification } from '../schemas/world';
import { compileWorld, type CompileOptions } from './worldCompiler';
import { layoutWorld } from './layoutEngine';
import { validatePlacedWorld } from './validator';

/**
 * The full deterministic pipeline, exposed as one call:
 *
 *   Architecture Graph -> World Specification -> Placed World Specification
 *
 * This is the only entry point the Next.js layer needs. It performs no I/O and
 * holds no state, so it is safe to run on the server or in a test.
 */

export interface PipelineResult {
  world: WorldSpecification;
  placed: PlacedWorld;
}

export function buildWorld(
  graphInput: unknown,
  options: CompileOptions = {},
): PipelineResult {
  const graph = validateOrThrow(
    ArchitectureGraphSchema,
    graphInput,
    validateArchitectureGraph,
    'Architecture Graph',
  );

  const world = compileWorld(graph, options);

  const worldErrors = validateWorldSpecification(world);
  if (worldErrors.length > 0) {
    throw new Error(`World compilation produced an invalid specification:\n  - ${worldErrors.join('\n  - ')}`);
  }

  const placed = layoutWorld(world);

  const placedErrors = validatePlacedWorld(placed);
  if (placedErrors.length > 0) {
    throw new Error(`Layout produced an invalid placed world:\n  - ${placedErrors.join('\n  - ')}`);
  }

  return { world, placed };
}

export { compileWorld, layoutWorld };
export type { CompileOptions };
export { WorldSpecificationSchema };