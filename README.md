# Architecture → 3D World Visualization

Turn a software repository into an interactive 3D city that visually explains its architecture.

```
Repository
  → Architecture Intelligence (LangGraph + OpenRouter)
  → Architecture Graph            [DATA]
  → World Compiler
  → World Specification           [DATA]
  → Deterministic Layout Engine
  → Placed World Specification    [DATA]
  → Scene Agent (LangGraph + OpenRouter)
  → Scene Program                 [CODE]
  → Sandbox (static validation → isolated build → restricted iframe)
  → Next.js + React Three Fiber   [RUNTIME]
  → Interactive 3D World
```

## The invariant

```
ARCHITECTURE IS DATA.
WORLD IS DATA.
SCENE IS CODE.
RENDERING IS RUNTIME.
```

| Stage | Responsibility | Question it answers |
|---|---|---|
| Architecture Agent | Repository → Architecture Graph | **WHAT** exists |
| World Compiler | Architecture Graph → World Specification | **HOW** it is represented |
| Layout Engine | World Specification → Placed World | **WHERE** things go |
| Scene Agent | Placed World + Scene SDK → Scene Program | **HOW** it looks |
| Runtime Engine | Events → animation/state | **HOW** it moves |

A repository change changes the generated architecture/world/scene. It never requires rewriting the visualization frontend.

## Status

| Phase | Description | Status |
|---|---|---|
| 1 | Schemas + validation | ✅ Done |
| 2 | World Compiler | ✅ Done |
| 3 | Deterministic Layout Engine | ✅ Done |
| 4 | 3D Renderer (R3F) | ✅ Done |
| 5 | Scene SDK | ✅ Done |
| 6 | Real Architecture AI integration | 🟡 Agent built, needs repo-context adapter |
| 7 | Scene Agent | ✅ Done |
| 8 | Sandbox (static validation) | 🟡 Static gate done; isolated build pending |
| 9 | Runtime Events | ✅ Done |
| 10 | Visual Critic | ⬜ Not started |
| 11 | GLB Assets | 🟡 Registry + resolver done; loader pending |
| 12 | Style / Polish | 🟡 5 styles done |

## Quick start

Two processes: the Next.js app and the Python Architecture Intelligence service.

### 1. Configure

```bash
cp .env.example .env
```

Then edit `.env` and set at minimum:

```
OPENROUTER_API_KEY=sk-or-v1-...        # required — model provider
GITHUB_TOKEN=ghp_...                   # optional — raises GitHub rate limit 60 → 5000/hour
```

`.env` is gitignored. Never put real keys in `.env.example`.

### 2. Start the Architecture Intelligence service (terminal 1)

```bash
cd services/architecture
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Verify: <http://127.0.0.1:8000/health> → `{"status":"ok"}`

### 3. Start the Next.js app (terminal 2)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### 4. Use it

Paste any public GitHub URL into the **Analyze a repository** panel and click
**Analyze**. The service fetches the real repository, runs the Architecture
Agent, and the resulting Architecture Graph is compiled into a 3D world in the
browser.

Try:
- `https://github.com/tiangolo/fastapi`
- `https://github.com/expressjs/express`
- `https://github.com/pallets/flask`

Two fixtures are also wired up for offline use:

- `http://localhost:3000` — RPA procedure-memory agent
- `http://localhost:3000/?repo=shopfront` — e-commerce platform

Both render through the **same** `WorldRenderer`. That is the core architectural proof.

### Other commands

```bash
npm test                                        # 34 TypeScript tests
npm run typecheck                               # strict mode
python -m pytest services/architecture -q       # 55 Python tests
```

## How repository analysis works

```
Paste URL
  → POST /api/analyze            (Next.js route — keeps service URL server-side)
  → POST /projects/analyze-url   (FastAPI)
  → repo_fetcher                 (GitHub API: metadata + tree + key files)
  → Architecture Agent           (LangGraph + OpenRouter, validated + repair loop)
  → Architecture Graph           (validated against the contract)
  → buildWorld()                 (browser: compile + deterministic layout)
  → 3D world
```

`repo_fetcher.py` selects the most architecture-revealing files (manifests,
entrypoints, routes, services, infra) and skips vendored/binary paths. Context is
capped so a large repository cannot exhaust the model window.

The frontend never inspects repository source. It receives a validated
Architecture Graph and treats it as data.

## Project structure

```
world/
  schemas/            # Phase 1 — typed contracts (zod)
    architecture.ts   #   Architecture Graph
    world.ts          #   World Specification + Placed World
    runtimeEvent.ts   #   Runtime events + event→behavior map
    validate.ts       #   validation helpers
  compiler/           # Phase 2 + 3
    worldCompiler.ts  #   Architecture Graph → World Specification
    layoutEngine.ts   #   World Specification → Placed World
    routePlanner.ts   #   connection path routing
    random.ts         #   deterministic PRNG (mulberry32)
    validator.ts      #   post-layout validation
    index.ts          #   buildWorld() — the single entry point
  registries/         # data-driven extension points
    semanticRegistry.ts   # node/edge type → archetype + primitive
    primitiveRegistry.ts  # primitive → footprint + height
    behaviorRegistry.ts   # behavior primitives
    assetRegistry.ts      # optional GLB layer

scene-sdk/            # Phase 5 — the ONLY surface the Scene Agent may use
  buildings/          #   OfficeBuilding, DataCenter, Airport, ...
  primitives/         #   people, vehicles, connections, effects
  behaviors/          #   MoveAlongPath, Pulse, Spawn, ...

components/visualization/   # Phase 4 — the fixed runtime
  WorldCanvas.tsx     #   R3F host
  WorldRenderer.tsx   #   universal renderer (no repo-specific branches)
  EntityRenderer.tsx  #   primitive registry → component
  ConnectionRenderer.tsx
  ZoneRenderer.tsx
  CameraController.tsx
  RuntimeEventLayer.tsx
  Inspector.tsx       #   metadata + provenance
  DebugPanel.tsx      #   every pipeline stage, inspectable
  Toolbar.tsx         #   filters, styles, replay

services/architecture/      # Python: Architecture Intelligence
  architecture_agent.py     #   LangGraph: repo → Architecture Graph
  scene_agent.py            #   LangGraph: placed world → Scene Program
  scene_validator.py        #   static sandbox gate
  provider.py               #   OpenRouter model provider
  contracts.py              #   Pydantic mirrors of the TS contracts
  main.py                   #   FastAPI boundary

fixtures/             # hand-authored architecture graphs + runtime story
```

## Determinism

Same input + same seed ⇒ byte-identical layout.

- Seed derived from `repository.name:branch` via FNV-1a (`deriveSeed`)
- All randomness from `mulberry32`, never `Math.random()`
- Entities processed in sorted id order, so input order never matters
- Coordinates rounded to 4 decimals for stable serialization

```ts
const { architecture, world, placed } = buildWorld(RPA_ARCHITECTURE);
// placed is identical on every run, on every platform
```

## No repository-specific rendering

The renderer resolves everything through registries:

```ts
// ✅ Correct — generic
semantic_type = 'database'
archetype     = 'building'
visual.primitive = 'data_center'

// ❌ Never
if (type === 'postgres') renderPostgres();
```

Adding a new concept means adding a registry entry plus an SDK primitive. The renderer core never changes.

## Sandboxing generated scene code

`eval()`, `new Function()`, unsandboxed Node execution and equivalents are **never** used.

```
Scene Agent → Generated TSX → static validation → TS compile
  → isolated sandbox build → preview bundle → restricted iframe
```

`scene_validator.py` rejects, before any build:

- unsupported imports (only `@/scene-sdk`, `@/world/schemas/world`, `react`)
- filesystem, `child_process`, `process`/env access
- arbitrary networking (`fetch`, `XMLHttpRequest`, `WebSocket`, `http`, `net`)
- database clients (`pg`, `ioredis`, `mongodb`, `@prisma`, cloud SDKs)
- server-only Next.js APIs (`next/headers`, `next/server`, `server-only`)
- dynamic code execution (`eval`, `new Function`, `require`, `import()`)
- non-determinism (`Math.random`, `Date.now`)
- any JSX component outside the Scene SDK

## Provenance

Every visual element is traceable:

```
3D Entity → World Entity ID → Architecture Node ID → Repository file/symbol
```

Click any entity in the 3D view to see its metadata and provenance chain.

## API boundary

The Python service exposes adapters rather than forcing a rewrite:

```
GET  /health
POST /projects/analyze          → Architecture Graph
POST /projects/scene/generate   → Scene Program (statically validated)
POST /projects/scene/validate   → validation result
```

World compilation, layout and rendering stay in Next.js.

## Environment

Copy `.env.example` to `.env`:

```
ARCHITECTURE_SERVICE_URL=http://127.0.0.1:8000
OPENROUTER_API_KEY=
OPENROUTER_ARCHITECTURE_MODEL=anthropic/claude-sonnet-4
OPENROUTER_SCENE_MODEL=anthropic/claude-sonnet-4
```

Run the Python service:

```bash
cd services/architecture
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Tests

```bash
npm test                                        # 34 TS tests
python -m pytest services/architecture -q       # 33 Python tests
```

Coverage includes: schema rejection of malformed AI output, referential integrity, parent-cycle detection, coordinate-smuggling rejection, compiler determinism, layout determinism, collision resolution, route endpoint validation, topology preservation, and the full sandbox denylist.

## Non-goals

- Rebuilding the existing application
- Replacing existing AI functionality
- Letting the Scene Agent understand architecture
- Hardcoding technologies into `WorldRenderer`
- Letting an LLM determine exact x/y/z coordinates
- Requiring downloaded 3D assets for the MVP
- Executing arbitrary generated code
- Storing the only source of truth inside generated scene code
