# RPG World Redesign Plan

## Purpose and scope

Transform this project from a technical 3D architecture-city viewer into a coherent, playable-feeling 2.5D RPG world. The RPG is the way people explore and understand a repository; it must not become a generic game that loses the connection to the repository.

This document is a plan only. No implementation or production asset generation was performed. `services/architecture/prac.py` was intentionally excluded from review and is out of scope.

## What exists today

### Current pipeline

```text
GitHub repository
  -> FastAPI Architecture Agent
  -> ArchitectureGraph (generic nodes, edges, groups, provenance)
  -> TypeScript World Compiler
  -> WorldSpecification (semantic entities, zones, connections)
  -> deterministic layout engine
  -> PlacedWorld (positions and routes)
  -> React Three Fiber renderer
  -> technical 3D city
```

The fundamental split is strong and worth retaining:

- Architecture data carries no coordinates and remains the source of truth.
- `world/compiler` deterministically turns semantic structure into spatial structure.
- React Three Fiber renders placed data without repository-specific `if` branches.
- Clicking an entity exposes its source-file/symbol provenance.
- The FastAPI service already validates LLM-produced architecture data before it reaches the browser.

### Why the visual result feels wrong for the desired experience

The current renderers are a city-diagram system, not a game scene:

- `EntityRenderer` maps every semantic type to a fixed modern building, vehicle, or geometric marker.
- `ZoneRenderer` draws translucent rectangles, and `ConnectionRenderer` draws technical route lines.
- `layoutEngine` places roots on a jittered grid and children in orbits, then resolves overlap. That is appropriate for a diagram, but it has no walkable terrain, room boundaries, gateways, or gameplay affordances.
- `WorldExplorer` presents debug-oriented panels, style chips, and visual-style presets instead of game-facing HUD, quests, dialogue, and progression.
- `RuntimeEventLayer` animates a workflow replay, but has no player, NPC, collision, interaction, inventory, or quest state.
- The existing Scene Agent can generate validated TSX but is not wired into the frontend runtime, and generated arbitrary scene code is the wrong extension point for core gameplay.

## Reference-document interpretation

The three PDFs are treated as creative/architectural intuition, not as instructions that override this request. Their recurring useful direction is:

- an architecture/repository should become a semantic fantasy world rather than a collection of technical buildings;
- LLMs should propose meaning, narrative, and quest intent, while deterministic code owns coordinates, tiles, routes, collisions, and validation;
- use a 2.5D RPG presentation: low-poly terrain or tiles with camera-facing character sprites, a fixed oblique camera, and a consistent stylized/pixel-art language;
- define a declarative `GamePack` contract containing regions, locations, NPCs, quests, interactions, assets, and rules;
- validate schema integrity, quest prerequisites, references, spatial collisions, and reachability before rendering;
- generate procedural/common scenery deterministically and reserve AI artwork for distinctive story assets.

The plan below uses these ideas selectively and adapts them to the existing codebase. It does **not** assume that a full multi-modal ingestion, AI asset pipeline, or autonomous agent loop must be built for the first RPG release.

## Product decision

Build a deterministic **repository RPG explorer** with two layers:

1. **World layer**: repository groups become regions, architecture nodes become landmarks/rooms, and architecture edges become paths, portals, rivers, or magical conduits.
2. **Learning/gameplay layer**: the player speaks with guides, follows a short quest chain, visits landmarks, and reveals architecture explanations and provenance through interaction.

The first release should preserve the current GitHub-repository analysis path. Support for PDFs, diagrams, and other source types is a later ingestion expansion, not a prerequisite for fixing the renderer.

## Target experience

On load, the user sees an RPG map, not a control dashboard:

- A fixed three-quarter camera frames a handcrafted-looking world with readable terrain, paths, landmarks, props, and depth.
- The current repository is introduced as a world theme (for example, an RPA repository becomes an Automation Kingdom with a Task Gate, Planner Hall, Memory Archive, Tool Workshop, and Target Realm).
- A player avatar can move over walkable tiles, with a keyboard-first control scheme and an optional click-to-walk fallback.
- Important architecture components are world landmarks. Interacting with one opens a compact codex card: what it represents, relationships, and source provenance.
- NPCs offer explanatory quests. Completing a discovery/interaction objective unlocks the next piece of the architecture.
- Runtime events can later become diegetic activity: delivery sprites on data routes, pulses from successes/failures, and visual changes to landmarks.
- Debug information remains available, but behind a developer-only toggle rather than competing with the game UI.

## Architectural shape after the redesign

```text
ArchitectureGraph (existing)
  -> WorldSpecification / PlacedWorld (existing semantic truth; retained)
  -> RPG World Compiler (new deterministic adapter)
       -> GamePack: theme, tile map, landmarks, NPCs, quests, interactions
       -> GameMap: terrain, collision, walkable cells, paths, spawn points
  -> validators (schema, references, reachability, quest DAG, placement)
  -> RPG Runtime (player state, input, interactions, quest progression)
  -> 2.5D R3F renderer (terrain, landmarks, sprites, HUD, codex)
```

The `GamePack` is the new boundary. It should be declarative data, never TSX generated by a model. The current `PlacedWorld` remains available for provenance and for a developer/architecture-inspection mode.

## Data-model plan

Create a new `game/` domain rather than overloading `world/schemas/world.ts` with gameplay concerns.

### Core contracts

Define Zod schemas and TypeScript types for:

- `GamePack`: version, repository/world identity, seed, theme, map, landmarks, NPCs, quests, interactions, player spawn, and asset manifest.
- `TileMap`: width, height, tile size, terrain grid, walkability grid, collider list, zones/regions, and path cells.
- `Landmark`: stable id, label, `architectureEntityId`, world/tile footprint, visual archetype, interaction id, and provenance reference.
- `Npc`: stable id, label, role, tile position, sprite/archetype, dialogue tree id, optional architecture link, and quest hooks.
- `Quest`: id, title, objective sequence, prerequisite ids, reward/unlock ids, architecture concepts/entity ids explained, and state transition rules.
- `Interaction`: `inspect`, `talk`, `visit`, `collect`, `unlock`, and safe predefined event actions. No executable script strings.
- `GameState`: player position/facing, discovered entities, active/completed quests, inventory/unlocks, dialogue state, and preference/accessibility state.
- `RpgRuntimeEvent`: an adapter from the existing `RuntimeEvent` to diegetic effects, without changing the existing event contract initially.

All cross-references must use stable ids and be validated. Existing source provenance remains on architecture/world entities and is referenced by id; it must not be duplicated inconsistently into every game object.

### Semantic mapping rules

Add a data-driven `game/registries/semanticWorldRegistry.ts` that maps generic existing node types to RPG roles. It must never special-case technologies such as Redis or Postgres.

Illustrative mappings:

| Existing semantic type | RPG landmark role |
| --- | --- |
| `agent`, `scheduler`, `monitor` | guild hall, command tower, observatory |
| `service`, `frontend`, `backend` | town hall, workshop, tower |
| `database`, `cache`, `storage` | archive, memory vault, storehouse |
| `queue`, `broker` | dispatch depot, courier station |
| `tool`, `compute` | forge, laboratory |
| `external_service` | portal, distant realm gate |
| `user`, `task` | traveler NPC, quest marker |

Edges map to paths and gameplay-facing effects: dependency/control flow becomes a road or conduit, data/memory flow becomes a courier route, API calls become portals, and event/sync edges become signal effects. The mapping remains generic and configurable by theme.

## Deterministic map-compiler plan

Replace diagram-like placement only at the RPG adapter layer; do not weaken the deterministic world compiler.

1. Accept `PlacedWorld` plus an optional selected RPG theme.
2. Convert placed zones into bounded RPG regions, maintaining their relative geography.
3. Snap landmark anchors to a tile grid and expand them into validated footprints.
4. Lay terrain around regions: path, grass/stone, water/cliffs, and decorative ground layers from seeded rules.
5. Reserve clear entrances around every landmark and route topology-derived paths between linked landmarks using grid A*.
6. Create NPCs and quests deterministically from graph structure, using templates in the first release.
7. Assign a player spawn in a safe, reachable hub tile.
8. Run validations; fail with actionable errors instead of silently producing an unusable map.

Initial quest generation should be deterministic and template-based, not LLM-authored:

- choose a hub/control landmark as guide or starting point;
- introduce connected landmarks in dependency-aware order;
- use `visit` and `inspect` objectives to explain components;
- unlock traversal and codex entries as objectives complete;
- represent runtime replay as an optional final “watch the process” quest.

LLM-generated world descriptions, character names, and dialogue can be added later behind the same validated `GamePack` contract. They must be grounded in the architecture graph and should not invent components.

## Renderer and interaction plan

### Replace the presentation layer

Retire the default technical-city presentation from the primary route. Keep it available as a developer mode until the RPG renderer is proven.

New component boundaries:

- `components/rpg/RpgStudio.tsx`: owns `GamePack`, game state, and mode switching.
- `components/rpg/RpgCanvas.tsx`: R3F host configured for the RPG camera and pixel/stylized output.
- `components/rpg/RpgWorldRenderer.tsx`: composes terrain, paths, landmarks, props, NPCs, player, and event effects from data.
- `components/rpg/TileMapRenderer.tsx`: batches terrain tiles/instanced props where appropriate.
- `components/rpg/LandmarkRenderer.tsx`: renders one semantic landmark archetype with interaction focus and quest state.
- `components/rpg/SpriteBillboard.tsx`: camera-facing character/prop sprite primitive with nearest-neighbor textures.
- `components/rpg/PlayerController.tsx`: fixed-timestep movement, collision checks, facing, and interaction radius.
- `components/rpg/InteractionSystem.tsx`: resolves nearby interactables and emits declarative game actions.
- `components/rpg/GameHud.tsx`, `DialoguePanel.tsx`, `QuestLog.tsx`, and `CodexPanel.tsx`: game UI outside the canvas.
- `components/rpg/DeveloperDrawer.tsx`: opt-in access to the existing debug payloads and raw architecture data.

### Visual language

Adopt one initially fixed art direction: warm fantasy/arcane-tech, 2.5D, and deliberately stylized rather than photorealistic. Use a narrow palette, terrain texture set, material rules, sprite resolution, and consistent camera angle. Avoid a style dropdown that mixes unrelated looks in the same product experience.

Initial implementation can use procedural low-poly meshes and placeholder sprite sheets. Asset delivery must follow a registry/manifest so generated or hand-authored assets can replace placeholders without changing renderer logic.

R3F settings to validate during implementation:

- fixed oblique orthographic or restrained perspective camera (prototype both; choose based on readable landmarks and player movement);
- camera-facing sprites for player/NPCs and selected props;
- nearest-neighbor filtering for pixel assets, no blurred mipmap look;
- low render resolution/upscale or a lightweight pixelation pass only if it improves legibility;
- shadows, fog, and lighting tuned for path/landmark readability over spectacle;
- camera and player coordinates snapped appropriately to avoid visual jitter.

### UI behavior

- Replace the permanent repository input card with a compact title/menu overlay and an “Analyze repository” entry point.
- Keep repository analysis progress/errors, but present them as loading/adventure preparation state.
- Show only the current quest, interaction prompt, and concise codex detail in normal play.
- Preserve the existing provenance data in the codex so users can connect a landmark back to source file/symbol.
- Support keyboard movement and `E`/Enter to interact; provide visible controls and an accessible non-keyboard alternative.
- Keep pause/reset, but define what reset means for game state versus replacing the analyzed repository.

## Runtime-state plan

Use a small explicit reducer or state machine at first; do not add a heavy ECS library until profiling or mechanics justify it.

State transitions must be event-driven and testable:

```text
idle -> moving -> near-interactable -> interaction-open
interaction -> objective-progressed -> quest-completed -> unlock-applied
```

The existing runtime-event replay should become a separate adapter layer after core navigation works. It should translate an event into a courier sprite, spell/conduit pulse, landmark state change, or success/failure effect; it must not move the player or alter quest truth unexpectedly.

Persist only safe local progress initially, keyed by a repository/world fingerprint and game-pack version. Provide an explicit reset/forget action; do not persist raw repository content unnecessarily.

## Phased implementation plan

### Phase 0 - visual and interaction specification

Deliver a short design token sheet, one wireframe, and a fixture-world storyboard before building features.

- Select the initial camera model after a small side-by-side prototype.
- Define palette, tile size, landmark silhouette rules, sprite resolution, HUD states, and accessibility rules.
- Write a player journey for the existing `rpa-agent` fixture: arrive at Task Gate, speak to the Guide, inspect Memory Archive, visit Tool Forge, activate Target Portal, then view workflow replay.
- Establish scope cuts: no combat, procedural dialogue generation, multiplayer, economy, or unrestricted scripted behavior in the MVP.

Exit criterion: the intended RPG experience can be reviewed without looking at implementation details.

### Phase 1 - contracts and deterministic game compiler

- Add `game/schemas/` for `GamePack`, tiles, landmarks, NPCs, quests, interactions, and game state.
- Add `game/compiler/` for `compileGamePack`, map generation, path carving, spawn selection, quest-template compilation, and validators.
- Add generic semantic-to-RPG registries and a deterministic theme registry.
- Add a hand-authored RPG fixture that derives from `RPA_ARCHITECTURE` and snapshots compiler output.
- Keep `buildWorld()` unchanged; invoke the RPG compiler after it produces `PlacedWorld`.

Exit criterion: same architecture input + seed produces byte-identical `GamePack`; invalid references, collision, unreachable quest target, or quest cycle produces a clear validation failure.

### Phase 2 - renderable map and landmark vertical slice

- Add the RPG canvas/world/tile/landmark/sprite renderer components.
- Render the RPA fixture as terrain, paths, five themed landmarks, a player, and one guide NPC.
- Implement one fixed camera, focus/hover state, basic player movement, collision, and camera follow.
- Preserve a hidden/opt-in route or mode for the existing city renderer while visual comparison is useful.

Exit criterion: a user can move from spawn to all required landmarks without clipping, blocked paths, or camera disorientation.

### Phase 3 - interactions, codex, and quests

- Implement interaction-radius detection and an interaction prompt.
- Build dialogue, inspection/codex, quest log, and completion/unlock UI.
- Make all architecture explanations and provenance come from existing `ArchitectureGraph`/`PlacedWorld` data.
- Compile deterministic quest templates from graph topology and test the RPA walkthrough end-to-end.

Exit criterion: the fixture world tells a complete, comprehensible architecture story with a finite quest path and every landmark remains traceable to source metadata.

### Phase 4 - live repository integration and event playback

- Update `WorldStudio`/entry routing to compile a `GamePack` after every successful repository analysis.
- Reframe the repository-analysis UI as an in-game entry flow without obscuring errors or retry behavior.
- Adapt `RuntimeEventLayer` into RPG effects and expose replay as a quest/codex action.
- Add graceful fallback UI if a repository graph is valid but cannot be converted into a playable map.

Exit criterion: both existing fixture repositories and a newly analyzed public repository render in the RPG experience with no repository-specific rendering branch.

### Phase 5 - art, performance, and optional intelligent content

- Replace placeholder visuals via an asset manifest and a small curated asset set; retain procedural fallbacks.
- Add generated assets only where a curated/procedural asset cannot communicate an important unique concept. Store provenance, prompt/version, and license/source metadata in the manifest.
- Optionally add schema-constrained LLM content generation for theme flavor and dialogue, grounded in the architecture graph; never allow it to output game runtime code.
- Profile tile/prop batching, texture memory, and large-repository map scaling; apply instancing/chunking only where measurements require it.

Exit criterion: a polished but performant visual style remains coherent across several very different repositories.

## Files and seams expected to change

| Existing area | Planned role |
| --- | --- |
| `world/schemas/*`, `world/compiler/*` | Retain as architecture-to-placed-world truth; add only non-breaking adapters if needed. |
| `world/registries/*` | Keep technical semantic registries; introduce separate game-theme registries instead of corrupting current mappings. |
| `components/visualization/WorldStudio.tsx` | Become or delegate to an RPG studio after architecture analysis succeeds. |
| `components/visualization/WorldCanvas.tsx`, `WorldRenderer.tsx` | Remain a legacy/developer city-view path during migration; do not force game concerns into them. |
| `components/visualization/Inspector.tsx`, `DebugPanel.tsx` | Reuse their data/provenance concepts in the codex and developer drawer. |
| `components/visualization/RuntimeEventLayer.tsx` | Refactor/adapt after game navigation works; retain the source event schema. |
| `scene-sdk/*` | Either evolve into a neutral visual primitive library or leave intact while RPG primitives live under `components/rpg` until a stable contract emerges. |
| `services/architecture/*` | No initial change needed for the RPG renderer. Later, expose validated narrative/theme data only through an explicit contract, not generated TSX. |
| `fixtures/*` | Add deterministic game-pack and playthrough fixtures alongside the current architecture fixtures. |

## Validation and test plan

Add automated tests at the contract boundaries, not only visual smoke tests.

- Schema tests: reject invalid terrain types, duplicate ids, unknown links, malformed objectives, and unsupported action types.
- Compiler determinism: identical architecture/theme/seed produces identical map cells, placements, quests, and spawn.
- Placement tests: no overlapping landmark footprints; all entrances are on walkable tiles.
- Navigation tests: flood-fill from spawn reaches every mandatory landmark, quest objective, NPC, and unlock target; A* paths are valid.
- Quest tests: prerequisites are acyclic, all targets exist, every required objective is reachable when unlocked, and all architecture concepts chosen for the story are covered.
- Provenance tests: every inspectable architecture landmark resolves to a `PlacedWorld` entity and source chain where one exists.
- Interaction reducer tests: moving, talking, visiting, completion, reset, and persistence migrations have deterministic outcomes.
- UI tests: loading/failure states remain accessible; keyboard and non-keyboard interaction paths work; developer data does not overlay normal play.
- Visual QA: capture baseline screenshots for each fixture at common viewport sizes and check player, NPC, labels, panel layout, camera framing, and pixel-art filtering manually before release.
- Regression suite: retain existing world/compiler tests so the RPG layer cannot weaken architecture validation or layout determinism.

## Constraints and guardrails

- Preserve the invariant: architecture is data; the visual/game layer is a deterministic interpretation of it.
- Never hardcode a repository, framework, database, or identifier into an RPG renderer.
- Models may suggest labels, flavor, or quests only through validated data; deterministic code decides tile coordinates, collision, routing, and executable behavior.
- Do not use executable game scripts, `eval`, generated TSX, or arbitrary user/LLM code for interactions.
- Keep the existing source provenance visible and do not make fictional naming obscure factual architecture explanations.
- Treat the game as exploratory/educational unless a separate product decision defines scoring, assessment, or combat.
- Keep `prac.py` untouched and excluded.

## Decisions to make before Phase 1

These choices materially affect implementation but do not block the above discovery work:

1. Choose initial visual reference: pixel-art fantasy, low-poly fantasy, or arcane-tech. The plan assumes a hybrid 2.5D pixel/stylized look because it best matches the supplied intuition and the current R3F stack.
2. Choose camera: prototype orthographic and restrained perspective, then select one. Orthographic favors readability; perspective adds depth but is harder to keep pixel-crisp.
3. Decide whether the first release is a guided narrative walkthrough (recommended) or a free-exploration sandbox. Guided is the clearest way to make a repository understandable.
4. Decide whether generated art is permitted in the first release. The recommended MVP uses procedural/crafted placeholders and asset manifests first.
5. Decide how much of the current city renderer remains exposed after migration. Recommended: keep it only as a developer inspection mode until the RPG implementation reaches parity on provenance and repository coverage.

## Definition of done for the first RPG MVP

The MVP is complete when a user can analyze a repository, enter a visually coherent RPG map, move a player through it, complete a short dependency-aware quest path, inspect every featured landmark to see its architecture meaning and provenance, replay relevant runtime activity as diegetic effects, and reset/switch repositories safely. The map must be deterministic, validated for collisions and reachability, generic across repositories, and free of the always-on technical dashboard aesthetic.
