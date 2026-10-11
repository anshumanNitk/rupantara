'use client';

import { useMemo } from 'react';
import type { GamePack } from '@/game/schemas/gamePack';
import type { GameState } from '@/game/schemas/gameState';
import type { TileCoord, Facing } from '@/game/schemas/common';
import { resolveSprite } from '@/game/registries/spriteRegistry';
import { TileMapRenderer } from './TileMapRenderer';
import { LandmarkRenderer } from './LandmarkRenderer';
import { NpcWanderer } from './NpcWanderer';
import { PlayerController } from './PlayerController';
import { RpgCameraController } from './RpgCameraController';
import { findNearbyInteractable } from './interactionSystem';
import type { RpgTokens } from './rpgTokens';

/**
 * RPG world renderer.
 *
 * Composes terrain, landmarks, NPCs, the player and the camera from data. It
 * contains no repository-specific logic: swapping the GamePack produces a
 * different world without changing a line here.
 */

export interface RpgWorldRendererProps {
  pack: GamePack;
  state: GameState;
  tokens: RpgTokens;
  /** When true, player input is frozen (dialogue open). */
  frozen?: boolean;
  onMove: (position: TileCoord, facing: Facing) => void;
  onSelectLandmark: (landmarkId: string) => void;
  onSelectNpc: (npcId: string) => void;
}

export function RpgWorldRenderer({
  pack,
  state,
  tokens,
  frozen = false,
  onMove,
  onSelectLandmark,
  onSelectNpc,
}: RpgWorldRendererProps) {
  const characterByEntity = useMemo(
    () => new Map((pack.narrative?.characters ?? []).map((character) => [character.architecture_node_id, character])),
    [pack.narrative],
  );
  const nearby = useMemo(
    () => findNearbyInteractable(pack, state.player.position, Math.ceil(tokens.interactRadius)),
    [pack, state.player.position, tokens.interactRadius],
  );

  const completedLandmarks = useMemo(() => {
    const completed = new Set<string>();
    for (const quest of pack.quests) {
      const progress = state.quests.find((q) => q.quest_id === quest.id);
      if (!progress) continue;
      for (const objective of quest.objectives) {
        if (objective.landmark_id && progress.completed_objectives.includes(objective.id)) {
          completed.add(objective.landmark_id);
        }
      }
    }
    return completed;
  }, [pack.quests, state.quests]);

  const activeLandmarkId = useMemo(() => {
    const current = pack.quests.find((quest) => state.quests.find((progress) => progress.quest_id === quest.id)?.status === 'active');
    if (!current) return null;
    const progress = state.quests.find((item) => item.quest_id === current.id);
    return current.objectives.find((objective) => !progress?.completed_objectives.includes(objective.id))?.landmark_id ?? null;
  }, [pack.quests, state.quests]);

  return (
    <>
      <color attach="background" args={[tokens.background]} />
      <fog attach="fog" args={[tokens.fog.color, tokens.fog.near, tokens.fog.far]} />

      <ambientLight intensity={tokens.ambient.intensity} color={tokens.ambient.color} />
      <directionalLight
        intensity={tokens.directional.intensity}
        color={tokens.directional.color}
        position={tokens.directional.position}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <hemisphereLight intensity={0.3} groundColor={tokens.ground} />

      <RpgCameraController target={state.player.position} tileSize={pack.map.tile_size} tokens={tokens} />

      <TileMapRenderer map={pack.map} theme={pack.theme} />

      {pack.landmarks.map((landmark) => (
        <LandmarkRenderer
          key={landmark.id}
          landmark={landmark}
          theme={pack.theme}
          tileSize={pack.map.tile_size}
          focused={nearby?.kind === 'landmark' && nearby.id === landmark.id}
          completed={completedLandmarks.has(landmark.id)}
          active={activeLandmarkId === landmark.id}
          onSelect={onSelectLandmark}
        />
      ))}

      {pack.npcs.map((npc) => (
        <NpcWanderer
          key={npc.id}
          npc={npc}
          pack={pack}
          highlighted={nearby?.kind === 'npc' && nearby.id === npc.id}
          onSelect={onSelectNpc}
          portraitPrompt={npc.architecture_entity_id ? characterByEntity.get(npc.architecture_entity_id)?.portrait_prompt : null}
        />
      ))}

      <PlayerController
        pack={pack}
        position={state.player.position}
        facing={state.player.facing}
        tokens={tokens}
        frozen={frozen}
        onMove={onMove}
      />
    </>
  );
}
