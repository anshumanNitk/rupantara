import type { PlacedWorld } from '../schemas/world';
import { validateWorldSpecification } from '../schemas/world';

/**
 * Post-layout validation. Catches problems that would otherwise surface as
 * visual glitches: missing entities, detached routes, NaN coordinates.
 */
export function validatePlacedWorld(placed: PlacedWorld): string[] {
  const errors: string[] = [];

  const asWorld = {
    schema_version: placed.schema_version,
    world: placed.world,
    zones: placed.zones,
    entities: placed.entities,
    connections: placed.connections,
    behaviors: placed.behaviors,
    asset_registry: placed.asset_registry,
  };

  errors.push(...validateWorldSpecification(asWorld));

  for (const entity of placed.entities) {
    const { x, y, z } = entity.resolved_position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      errors.push(`Entity "${entity.id}" has non-finite position`);
    }
  }

  for (const connection of placed.connections) {
    if (connection.path.length < 2) {
      errors.push(`Connection "${connection.id}" has a degenerate path`);
    }
    if (!Number.isFinite(connection.length) || connection.length <= 0) {
      errors.push(`Connection "${connection.id}" has an invalid length`);
    }
  }

  return errors;
}