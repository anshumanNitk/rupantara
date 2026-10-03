import type { GamePack } from '../schemas/gamePack';
import { isWalkable, inBounds, type TileMap } from '../schemas/tilemap';

/**
 * Structural validation for a GamePack.
 *
 * These checks go beyond zod: referential integrity, quest DAG acyclicity,
 * placement sanity, and reachability. A pack that fails here is never rendered.
 * Errors are actionable strings, not silent failures.
 */

export function validateGamePack(pack: GamePack): string[] {
  const errors: string[] = [];

  errors.push(...validateReferences(pack));
  errors.push(...validatePlacement(pack));
  errors.push(...validateQuestGraph(pack));
  errors.push(...validateReachability(pack));

  return errors;
}

/** Every cross-reference must resolve to a real object. */
function validateReferences(pack: GamePack): string[] {
  const errors: string[] = [];

  const landmarkIds = new Set(pack.landmarks.map((l) => l.id));
  const npcIds = new Set(pack.npcs.map((n) => n.id));
  const questIds = new Set(pack.quests.map((q) => q.id));
  const interactionIds = new Set(pack.interactions.map((i) => i.id));
  const dialogueIds = new Set(pack.dialogues.map((d) => d.id));
  const regionIds = new Set(pack.regions.map((r) => r.id));

  const duplicate = (label: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`Duplicate ${label} id: ${id}`);
      seen.add(id);
    }
  };

  duplicate('landmark', pack.landmarks.map((l) => l.id));
  duplicate('npc', pack.npcs.map((n) => n.id));
  duplicate('quest', pack.quests.map((q) => q.id));
  duplicate('interaction', pack.interactions.map((i) => i.id));
  duplicate('dialogue', pack.dialogues.map((d) => d.id));

  for (const landmark of pack.landmarks) {
    if (!interactionIds.has(landmark.interaction_id)) {
      errors.push(`Landmark "${landmark.id}" references unknown interaction "${landmark.interaction_id}"`);
    }
    if (landmark.region_id !== null && !regionIds.has(landmark.region_id)) {
      errors.push(`Landmark "${landmark.id}" references unknown region "${landmark.region_id}"`);
    }
  }

  for (const npc of pack.npcs) {
    if (!dialogueIds.has(npc.dialogue_id)) {
      errors.push(`NPC "${npc.id}" references unknown dialogue "${npc.dialogue_id}"`);
    }
    for (const hook of npc.quest_hooks) {
      if (!questIds.has(hook)) errors.push(`NPC "${npc.id}" references unknown quest "${hook}"`);
    }
  }

  for (const quest of pack.quests) {
    for (const prereq of quest.prerequisites) {
      if (!questIds.has(prereq)) {
        errors.push(`Quest "${quest.id}" references unknown prerequisite "${prereq}"`);
      }
    }
    for (const objective of quest.objectives) {
      if (objective.landmark_id !== null && !landmarkIds.has(objective.landmark_id)) {
        errors.push(`Objective "${objective.id}" references unknown landmark "${objective.landmark_id}"`);
      }
      if (objective.npc_id !== null && !npcIds.has(objective.npc_id)) {
        errors.push(`Objective "${objective.id}" references unknown NPC "${objective.npc_id}"`);
      }
      if (objective.interaction_id !== null && !interactionIds.has(objective.interaction_id)) {
        errors.push(`Objective "${objective.id}" references unknown interaction "${objective.interaction_id}"`);
      }
    }
  }

  for (const dialogue of pack.dialogues) {
    if (!npcIds.has(dialogue.npc_id)) {
      errors.push(`Dialogue "${dialogue.id}" references unknown NPC "${dialogue.npc_id}"`);
    }
    const nodeIds = new Set(dialogue.nodes.map((n) => n.id));
    if (!nodeIds.has(dialogue.root)) {
      errors.push(`Dialogue "${dialogue.id}" root "${dialogue.root}" is not a node`);
    }
    for (const node of dialogue.nodes) {
      for (const choice of node.choices) {
        if (choice.next !== null && !nodeIds.has(choice.next)) {
          errors.push(`Dialogue "${dialogue.id}" choice "${choice.id}" points at unknown node "${choice.next}"`);
        }
      }
    }
  }

  return errors;
}

/** Landmarks must not overlap, and entrances must be walkable. */
function validatePlacement(pack: GamePack): string[] {
  const errors: string[] = [];
  const map = pack.map;

  const occupied = new Map<string, string>();
  for (const landmark of pack.landmarks) {
    const { anchor, footprint } = landmark;
    for (let y = anchor.y; y < anchor.y + footprint.h; y += 1) {
      for (let x = anchor.x; x < anchor.x + footprint.w; x += 1) {
        if (!inBounds(map, x, y)) {
          errors.push(`Landmark "${landmark.id}" footprint extends outside the map at (${x},${y})`);
          continue;
        }
        const key = `${x},${y}`;
        const owner = occupied.get(key);
        if (owner !== undefined) {
          errors.push(`Landmark "${landmark.id}" overlaps "${owner}" at (${x},${y})`);
        } else {
          occupied.set(key, landmark.id);
        }
      }
    }

    if (!isWalkable(map, landmark.entrance.x, landmark.entrance.y)) {
      errors.push(`Landmark "${landmark.id}" entrance (${landmark.entrance.x},${landmark.entrance.y}) is not walkable`);
    }
  }

  for (const npc of pack.npcs) {
    if (!isWalkable(map, npc.position.x, npc.position.y)) {
      errors.push(`NPC "${npc.id}" stands on a non-walkable tile (${npc.position.x},${npc.position.y})`);
    }
  }

  if (!isWalkable(map, pack.spawn.position.x, pack.spawn.position.y)) {
    errors.push(`Spawn (${pack.spawn.position.x},${pack.spawn.position.y}) is not walkable`);
  }

  return errors;
}

/** Quest prerequisites must form a DAG (no cycles). */
function validateQuestGraph(pack: GamePack): string[] {
  const errors: string[] = [];
  const prereqs = new Map(pack.quests.map((q) => [q.id, q.prerequisites]));

  for (const quest of pack.quests) {
    const seen = new Set<string>([quest.id]);
    const stack = [...quest.prerequisites];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) {
        errors.push(`Quest cycle detected involving "${quest.id}"`);
        break;
      }
      seen.add(current);
      stack.push(...(prereqs.get(current) ?? []));
    }
  }

  return errors;
}

/**
 * Flood-fill from spawn. Every mandatory landmark entrance, NPC and quest
 * objective target must be reachable on foot.
 */
function validateReachability(pack: GamePack): string[] {
  const errors: string[] = [];
  const reachable = floodFill(pack.map, pack.spawn.position.x, pack.spawn.position.y);

  const requireReachable = (label: string, x: number, y: number): void => {
    if (!reachable.has(`${x},${y}`)) {
      errors.push(`${label} at (${x},${y}) is not reachable from spawn`);
    }
  };

  for (const landmark of pack.landmarks) {
    requireReachable(`Landmark "${landmark.id}" entrance`, landmark.entrance.x, landmark.entrance.y);
  }
  for (const npc of pack.npcs) {
    requireReachable(`NPC "${npc.id}"`, npc.position.x, npc.position.y);
  }

  return errors;
}

/** 4-connected flood fill over walkable tiles. */
export function floodFill(map: TileMap, startX: number, startY: number): Set<string> {
  const visited = new Set<string>();
  if (!isWalkable(map, startX, startY)) return visited;

  const queue: Array<[number, number]> = [[startX, startY]];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const neighbours: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isWalkable(map, nx, ny)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }

  return visited;
}
