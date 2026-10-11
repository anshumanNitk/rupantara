'use client';

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { ArchitectureGraph } from '@/world/schemas/architecture';
import type { PlacedWorld } from '@/world/schemas/world';
import type { RuntimeEvent } from '@/world/schemas/runtimeEvent';
import type { NarrativeGraph } from '@/game/schemas/narrative';
import { compileGamePack } from '@/game/compiler/gameCompiler';
import { createInitialGameState, reduceGameState } from '@/game/runtime/gameState';
import { createThemeResolver } from '@/game/registries/assetResolver';
import { catalogForTheme } from '@/game/registries/themeCatalogs';
import { createImageGeneratorProvider } from '@/game/registries/imageGeneratorProvider';
import { AssetResolverProvider } from './AssetResolverContext';
import { tokensForTheme } from './rpgTokens';
import { RpgCanvas } from './RpgCanvas';
import { GameHud } from './GameHud';
import { DialoguePanel } from './DialoguePanel';
import { useDialogue } from './useDialogue';
import { QuizPanel } from './QuizPanel';
import { QuestLog } from './QuestLog';
import { CodexPanel } from './CodexPanel';
import { DeveloperDrawer } from './DeveloperDrawer';
import { CutscenePlayer } from './CutscenePlayer';
import { MissionLog } from './MissionLog';
import { CharacterCodex } from './CharacterCodex';
import { EndingScreen } from './EndingScreen';
import { findNearbyInteractable } from './interactionSystem';

/**
 * RPG studio — owns the compiled GamePack, the game state machine and the UI
 * mode. It is the RPG counterpart of WorldExplorer.
 *
 * The pack is compiled deterministically from the PlacedWorld, so the same
 * repository always produces the same world. All gameplay transitions go
 * through the pure reducer in `game/runtime`.
 *
 * The narrative layer gives the world its soul: a prologue cutscene on arrival,
 * missions with stakes, characters with backstories, and an ending that pays
 * off what the player has learned.
 */

export interface RpgStudioProps {
  architecture: ArchitectureGraph;
  placed: PlacedWorld;
  initialEvents: RuntimeEvent[];
  /** A narrative from the Narrative Agent, if one was fetched. */
  narrative?: NarrativeGraph | null;
  /** Repository analysis overlay, rendered above the game. */
  repoInput: ReactNode;
  /** Switch back to the legacy technical city view. */
  onSwitchToCity: () => void;
}

type Panel = 'none' | 'quests' | 'codex' | 'developer' | 'missions' | 'characters';

export function RpgStudio({
  architecture,
  placed,
  initialEvents,
  narrative = null,
  repoInput,
  onSwitchToCity,
}: RpgStudioProps) {
  const compiled = useMemo(() => {
    try {
      return { pack: compileGamePack(placed, { narrative }), error: null as string | null };
    } catch (error) {
      return {
        pack: null,
        error: error instanceof Error ? error.message : 'Failed to compile the game world.',
      };
    }
  }, [placed, narrative]);

  if (!compiled.pack) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff9b9b',
          fontSize: 14,
          padding: 40,
          textAlign: 'center',
        }}
      >
        {compiled.error}
      </div>
    );
  }

  return (
    <RpgStudioInner
      key={compiled.pack.world.fingerprint}
      pack={compiled.pack}
      architecture={architecture}
      placed={placed}
      initialEvents={initialEvents}
      repoInput={repoInput}
      onSwitchToCity={onSwitchToCity}
    />
  );
}

function RpgStudioInner({
  pack,
  architecture,
  placed,
  initialEvents,
  repoInput,
  onSwitchToCity,
}: {
  pack: NonNullable<ReturnType<typeof compileGamePack>>;
  architecture: ArchitectureGraph;
  placed: PlacedWorld;
  initialEvents: RuntimeEvent[];
  repoInput: ReactNode;
  onSwitchToCity: () => void;
}) {
  const [state, dispatch] = useReducer(
    (current: ReturnType<typeof createInitialGameState>, action: Parameters<typeof reduceGameState>[2]) =>
      reduceGameState(pack, current, action),
    pack,
    createInitialGameState,
  );

  const [panel, setPanel] = useState<Panel>('none');
  const [codexEntity, setCodexEntity] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [quizQuestId, setQuizQuestId] = useState<string | null>(null);

  const narrative = pack.narrative ?? null;

  // The prologue plays once on arrival. Skipping or finishing it starts play.
  const [cutsceneId, setCutsceneId] = useState<string | null>(
    narrative?.prologue_cutscene_id ?? null,
  );
  const [endingSeen, setEndingSeen] = useState(false);

  const tokens = useMemo(() => tokensForTheme(pack.theme), [pack.theme]);

  // The asset chain: curated theme catalog -> procedural -> image generator ->
  // placeholder. The generator is best-effort; if the server has no image
  // provider configured it simply falls through.
  const assetResolver = useMemo(
    () =>
      createThemeResolver(pack.theme.id, {
        catalog: catalogForTheme(pack.theme.id),
        generator: createImageGeneratorProvider({ theme: pack.theme.id }),
      }),
    [pack.theme.id],
  );

  const nearby = useMemo(
    () => findNearbyInteractable(pack, state.player.position, Math.ceil(tokens.interactRadius)),
    [pack, state.player.position, tokens.interactRadius],
  );

  const dialogueOpen = state.dialogue.npc_id !== null && state.dialogue.node_id !== null;

  // Optional free-form conversation layer, answered by the dialogue provider
  // chain. It never touches the deterministic game state.
  const { conversation, start: startConversation, send: sendConversation, close: closeConversation } =
    useDialogue(pack, state);
  const canConverseHere = useMemo(() => {
    if (state.dialogue.npc_id === null) return false;
    const npc = pack.npcs.find((n) => n.id === state.dialogue.npc_id);
    if (!npc) return false;
    return (pack.narrative?.characters.find((c) => c.architecture_node_id === npc.architecture_entity_id)?.facts.length ?? 0) > 0;
  }, [pack, state.dialogue.npc_id]);

  // Detect the finale completing so the ending screen can play.
  const finaleComplete = useMemo(() => {
    // While the Narrative Agent is writing we use the deterministic tutorial
    // chain; after it arrives its finale is a real runtime quest. In both
    // cases the player gets a complete ending rather than a dead last task.
    const runtimeFinale = narrative?.finale_mission_id && pack.quests.some((quest) => quest.id === narrative.finale_mission_id)
      ? narrative.finale_mission_id
      : pack.quests[pack.quests.length - 1]?.id ?? null;
    return runtimeFinale !== null && state.quests.find((quest) => quest.quest_id === runtimeFinale)?.status === 'completed';
  }, [narrative, pack.quests, state.quests]);

  useEffect(() => {
    if (finaleComplete && !endingSeen) {
      setEndingSeen(true);
      if (narrative?.epilogue_cutscene_id) setCutsceneId(narrative.epilogue_cutscene_id);
    }
  }, [finaleComplete, endingSeen, narrative]);

  // Auto-open the quiz when a quest's objectives are done but its verifiable
  // quiz has not been passed. This is the "prove you understand" gate.
  useEffect(() => {
    if (quizQuestId !== null || cutsceneId !== null) return;
    const pending = pack.quests.find((quest) => {
      if (!quest.quiz) return false;
      const progress = state.quests.find((q) => q.quest_id === quest.id);
      if (!progress || progress.status !== 'active' || progress.quiz_passed) return false;
      return quest.objectives.every((o) => progress.completed_objectives.includes(o.id));
    });
    if (pending) setQuizQuestId(pending.id);
  }, [pack.quests, state.quests, quizQuestId, cutsceneId]);

  const handleMove = useCallback(
    (position: { x: number; y: number }, facing: 'north' | 'south' | 'east' | 'west') => {
      dispatch({ type: 'move', position, facing });
    },
    [],
  );

  const handleInteract = useCallback(() => {
    if (!nearby) return;
    if (nearby.kind === 'npc') {
      dispatch({ type: 'talk', npcId: nearby.id });
    } else if (nearby.interactionId) {
      dispatch({ type: 'interact', interactionId: nearby.interactionId });
      if (nearby.architectureEntityId) {
        setCodexEntity(nearby.architectureEntityId);
        setPanel('codex');
      }
    }
  }, [nearby]);

  const handleSelectLandmark = useCallback(
    (landmarkId: string) => {
      const landmark = pack.landmarks.find((l) => l.id === landmarkId);
      if (!landmark) return;
      dispatch({ type: 'interact', interactionId: landmark.interaction_id });
      setCodexEntity(landmark.architecture_entity_id);
      setPanel('codex');
    },
    [pack.landmarks],
  );

  const handleSelectNpc = useCallback((npcId: string) => {
    dispatch({ type: 'talk', npcId });
  }, []);

  // Keyboard interaction: E / Enter.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      if (cutsceneId !== null) return; // cutscene owns the keyboard
      if (event.code === 'KeyE' || event.code === 'Enter') {
        if (dialogueOpen || conversation !== null) return;
        handleInteract();
      }
      if (event.code === 'Escape') {
        setPanel('none');
        dispatch({ type: 'close_dialogue' });
        closeConversation();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleInteract, dialogueOpen, conversation, closeConversation, cutsceneId]);

  void initialEvents;

  const frozen = dialogueOpen || conversation !== null || panel !== 'none' || cutsceneId !== null || quizQuestId !== null;

  return (
    <AssetResolverProvider value={assetResolver}>
      <RpgCanvas
        pack={pack}
        state={state}
        tokens={tokens}
        frozen={frozen}
        onMove={handleMove}
        onSelectLandmark={handleSelectLandmark}
        onSelectNpc={handleSelectNpc}
      />

      <GameHud
        pack={pack}
        state={state}
        nearby={dialogueOpen || cutsceneId !== null ? null : nearby}
        onInteract={handleInteract}
        onOpenQuestLog={() => setPanel('quests')}
        onOpenCodex={() => setPanel('codex')}
        onOpenMissions={() => setPanel('missions')}
        onOpenCharacters={() => setPanel('characters')}
        onOpenDeveloper={() => setPanel('developer')}
        onSwitchToCity={onSwitchToCity}
        onReset={() => {
          dispatch({ type: 'reset' });
          setPanel('none');
          setEndingSeen(false);
          setQuizQuestId(null);
          setCutsceneId(narrative?.prologue_cutscene_id ?? null);
        }}
      />

      {(dialogueOpen || conversation) && (
        <DialoguePanel
          pack={pack}
          state={state}
          onChoice={(choiceId) => dispatch({ type: 'dialogue_choice', choiceId })}
          onClose={() => dispatch({ type: 'close_dialogue' })}
          conversation={conversation}
          onStartConversation={canConverseHere ? () => startConversation(state.dialogue.npc_id!) : undefined}
          onSend={sendConversation}
          onCloseConversation={closeConversation}
        />
      )}

      {panel === 'quests' && <QuestLog pack={pack} state={state} onClose={() => setPanel('none')} />}
      {quizQuestId && (
        <QuizPanel
          pack={pack}
          state={state}
          questId={quizQuestId}
          onAnswer={(choiceIndex) => dispatch({ type: 'quiz_answer', questId: quizQuestId, choiceIndex })}
          onClose={() => setQuizQuestId(null)}
        />
      )}
      {panel === 'codex' && (
        <CodexPanel
          pack={pack}
          state={state}
          architecture={architecture}
          entityId={codexEntity}
          onSelect={setCodexEntity}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'missions' && narrative && (
        <MissionLog narrative={narrative} state={state} accent={pack.theme.palette.accent} onClose={() => setPanel('none')} />
      )}
      {panel === 'characters' && narrative && (
        <CharacterCodex
          narrative={narrative}
          state={state}
          architecture={architecture}
          accent={pack.theme.palette.accent}
          selectedId={selectedCharacter}
          onSelect={setSelectedCharacter}
          onClose={() => setPanel('none')}
        />
      )}
      {panel === 'developer' && (
        <DeveloperDrawer
          pack={pack}
          state={state}
          architecture={architecture}
          placed={placed}
          onClose={() => setPanel('none')}
        />
      )}

      {cutsceneId !== null && narrative && (
        <CutscenePlayer
          narrative={narrative}
          cutsceneId={cutsceneId}
          accent={pack.theme.palette.accent}
          onComplete={() => setCutsceneId(null)}
          onSkip={() => setCutsceneId(null)}
        />
      )}

      {endingSeen && cutsceneId === null && narrative && (
        <EndingScreen
          narrative={narrative}
          state={state}
          accent={pack.theme.palette.accent}
          onClose={() => setEndingSeen(false)}
          onReplay={() => {
            dispatch({ type: 'reset' });
            setEndingSeen(false);
            setCutsceneId(narrative.prologue_cutscene_id ?? null);
          }}
        />
      )}

      {repoInput}
    </AssetResolverProvider>
  );
}
