# rpgkit: modular 2.5D RPG toolkit

Game Pack (JSON) → validated → runtime (player, NPCs, interactions, quests) → Three.js renderer (low-poly 3D + billboard sprites).

```
src/
  core/      types.ts (Game Pack schema) · game.ts (runtime) · pathfinding.ts (A*) · validate.ts · events.ts
  assets/    shapes.ts (procedural macros) · resolver.ts (provider chain: find → import → generate → placeholder)
  dialogue/  providers.ts (ScriptedProvider · LLMProvider · mockLLM)
  agent/     tools.ts (tool defs + PackBuilder so an LLM agent can build/edit packs)
  render/    three.ts (renderer) · ui.ts (HUD, keyboard)
  demo/      pack.ts (hand-written example pack) · main.ts
```

## Run
```
npm install
npm test               # headless core tests (node:test)
npm run typecheck
npm run build:demo     # writes demo.html (self-contained, double-click to play)
node scripts/e2e-smoke.mjs   # optional: drives demo.html in headless Chromium (needs @sparticuz/chromium + puppeteer-core)
```
Controls: WASD/arrows, click to walk (A*), E interact, 1-9 choose, type to talk to LLM NPCs, Esc leave.

## Repo -> game (new)
```
npx tsx scripts/repo2game.ts <repoDir> --out pack.json --html game.html [--seed N] [--no-play]
```
`analyze.ts` (JS/TS + Python imports, symbols, summaries; no LLM) -> `graph.ts` (modules, SCC-safe dependency layers, entry guess)
-> `layout.ts` (deterministic map: one column per layer, district per module, building per important file, A* roads along real dependencies)
-> `compile.ts` (NPC keepers, quests whose prerequisites mirror the dependency DAG, quiz questions whose answers are checked against the graph,
guide NPC with grounded facts for an LLM) -> `validate` -> `playtest.ts` (headless bot plays the pack through the real runtime; fails the build if a quest is unwinnable).
`polish` option = LLM may reword intro flavour text only; quest logic, quiz choices and answers are never LLM-generated.
Same repo + same seed = identical pack.

Known limits: only JS/TS/Python are parsed (other files skipped); imports are regex-resolved (no tsconfig path aliases, dynamic imports ignored);
heavily cyclic repos (e.g. Flask) collapse into one layer so quest order is flat; entry-point detection is a heuristic;
quizzes test architecture (who depends on whom), not what the code does; repos over 500 files are truncated to the largest 500; CAD/PDF front ends not built.

## The four extension points
1. **New object types**: `defineMacro('barrel', ['cask'], s => [...primitives])`. Or give an entity an inline `asset.shape`.
2. **Import from other libraries**: `createDefaultResolver({ manifest, catalogs, generator })`.
   Chain: procedural(exact) → your manifest → external catalogs → procedural(fuzzy) → AI generator → placeholder.
   A catalog is just `CatalogEntry[]` (id, aliases, tags, type gltf|sprite, url), static or fetched lazily.
   Point one at Kenney / Quaternius / Poly Pizza / your own mirror. (No real URLs are hard-coded: add the index you trust and check each licence.)
   `GeneratorProvider` is the hook for image/3D generation APIs. `renderer.assetReport()` shows which provider served what.
3. **Dialogue**: implement `DialogueProvider` (one method, `respond(ctx, input)`). `LLMProvider` takes any `complete(req) → string`.
   Safety built in: persona + grounded `facts` in the system prompt, player text marked untrusted, the model can only emit
   whitelisted/bounded actions (`give` of known items, `flag` namespaced `npc_*`, `say`), HUD uses textContent (no HTML injection),
   and any provider failure falls back to the next provider (e.g. the scripted tree).
4. **Agent building**: `TOOL_DEFS` (Anthropic tool-schema format) + `new PackBuilder(pack, resolver).call(name, args)`.
   Errors come back as data so the model can retry; `validate_pack` gates the result.

## Conventions
Tiles `[x,y]` ↔ world `x,z`; y is up. Primitives are placed by base-center. Actions/conditions are declarative JSON, never code.
Toggle = hide + unblock (doors, pickups). `game.snapshot()/restore()` for saves.

## Not built yet (next modules)
CAD/PDF front ends · LLM-written (grounded) quest content · minimap/compass · dependency-gated doors · BKT knowledge tracing · playtest bot · sprite-sheet animation · NPC long-term memory.
