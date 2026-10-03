import type { GamePack } from '@/game/schemas/gamePack';
import type { TileCoord } from '@/game/schemas/common';

/**
 * Interaction system.
 *
 * Pure, deterministic resolution of "what can the player interact with right
 * now". It returns a declarative target; the studio decides what to do with it.
 * No component state, no side effects — trivially testable.
 */

export type InteractableKind = 'landmark' | 'npc';

export interface Interactable {
  kind: InteractableKind;
  id: string;
  label: string;
  /** Interaction id for landmarks, dialogue id for NPCs. */
  interactionId: string | null;
  dialogueId: string | null;
  architectureEntityId: string | null;
  /** Tile the player must stand near. */
  tile: TileCoord;
  distance: number;
}

function manhattan(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Finds the nearest interactable within `radius` tiles. NPCs win ties against
 * landmarks so talking to a guide standing at a landmark entrance is easy.
 */
export function findNearbyInteractable(
  pack: GamePack,
  position: TileCoord,
  radius: number,
): Interactable | null {
  const candidates: Interactable[] = [];

  for (const npc of pack.npcs) {
    const distance = manhattan(position, npc.position);
    if (distance <= radius) {
      candidates.push({
        kind: 'npc',
        id: npc.id,
        label: npc.label,
        interactionId: null,
        dialogueId: npc.dialogue_id,
        architectureEntityId: npc.architecture_entity_id,
        tile: npc.position,
        distance,
      });
    }
  }

  for (const landmark of pack.landmarks) {
    const distance = manhattan(position, landmark.entrance);
    if (distance <= radius) {
      candidates.push({
        kind: 'landmark',
        id: landmark.id,
        label: landmark.label,
        interactionId: landmark.interaction_id,
        dialogueId: null,
        architectureEntityId: landmark.architecture_entity_id,
        tile: landmark.entrance,
        distance,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.kind !== b.kind) return a.kind === 'npc' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return candidates[0]!;
}
