import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game, RuntimeEntity } from '../core/game';
import type { EntityDef, ShapeSpec, SpriteSpec, Vec2 } from '../core/types';
import { expandShape } from '../assets/shapes';
import type { AssetResolver, Resolved } from '../assets/resolver';
import { KeyboardInput } from './ui';

// ---------------------------------------------------------------- shapes -> meshes (headless-safe)
const matCache = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c = '#cccccc') => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  return matCache.get(c)!;
};

function make(s: ShapeSpec): THREE.Object3D {
  let o: THREE.Object3D;
  const seg = s.segments ?? 12;
  switch (s.type) {
    case 'group': { const g = new THREE.Group(); for (const c of s.children ?? []) g.add(make(c)); o = g; break; }
    case 'box': { const [w, h, d] = s.size ?? [1, 1, 1]; const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); o = new THREE.Mesh(g, mat(s.color)); break; }
    case 'cylinder': { const r = s.radius ?? 0.5, h = s.height ?? 1; const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(0, h / 2, 0); o = new THREE.Mesh(g, mat(s.color)); break; }
    case 'cone': { const r = s.radius ?? 0.5, h = s.height ?? 1; const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); o = new THREE.Mesh(g, mat(s.color)); break; }
    case 'sphere': { const r = s.radius ?? 0.5; const g = new THREE.SphereGeometry(r, 12, 8); g.translate(0, r, 0); o = new THREE.Mesh(g, mat(s.color)); break; }
    case 'pyramid': { const [w, h, d] = s.size ?? [1, 1, 1]; const g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4); g.rotateY(Math.PI / 4); g.scale(w, 1, d); g.translate(0, h / 2, 0); o = new THREE.Mesh(g, mat(s.color)); break; }
    default: throw new Error(`Unknown shape '${s.type}'`);
  }
  const [px, py, pz] = s.position ?? [0, 0, 0];
  o.position.set(px, py, pz);
  if (s.rotate) o.rotation.y = THREE.MathUtils.degToRad(s.rotate);
  return o;
}
/** Build a Three object from any ShapeSpec (macros are expanded first). */
export const buildShape = (spec: ShapeSpec): THREE.Object3D => make(expandShape(spec));

// ---------------------------------------------------------------- sprites
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function charTexture(p: NonNullable<SpriteSpec['procedural']>): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 16; c.height = 24;
  const g = c.getContext('2d')!;
  const R = (col: string, x: number, y: number, w: number, h: number) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const skin = p.skin ?? '#f1c27d', hair = p.hair ?? '#3b2f2f', shirt = p.shirt ?? '#3a86ff', pants = p.pants ?? '#3d405b';
  R('#00000000', 0, 0, 16, 24);
  R(hair, 4, 1, 8, 4); R(hair, 4, 4, 1, 3); R(hair, 11, 4, 1, 3);
  R(skin, 5, 4, 6, 6); R('#222', 6, 6, 1, 2); R('#222', 9, 6, 1, 2);
  R(shirt, 4, 10, 8, 7); R(skin, 3, 11, 1, 5); R(skin, 12, 11, 1, 5);
  R(pants, 5, 17, 3, 5); R(pants, 8, 17, 3, 5); R('#222', 5, 22, 3, 2); R('#222', 8, 22, 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSprite(sp: SpriteSpec, scale: number): THREE.Object3D {
  const w = (sp.width ?? 0.8) * scale, h = (sp.height ?? 1.2) * scale;
  let map: THREE.Texture | null = null;
  if (sp.procedural) map = charTexture(sp.procedural);
  else if (sp.url) {
    map = new THREE.TextureLoader().load(sp.url);
    map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.colorSpace = THREE.SRGBColorSpace;
    if (sp.frame) { // show one frame of a sprite sheet
      const { cols, rows, index = 0 } = sp.frame;
      map.repeat.set(1 / cols, 1 / rows); map.offset.set((index % cols) / cols, 1 - (Math.floor(index / cols) + 1) / rows);
    }
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: map ?? undefined, alphaTest: 0.5, color: map ? 0xffffff : 0xff00ff }));
  s.center.set(0.5, 0); s.scale.set(w, h, 1);
  const g = new THREE.Group(); g.add(s);
  return g;
}

function blobShadow(r = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.01;
  return m;
}

const placeholder = (): THREE.Object3D => buildShape({ type: 'box', size: [0.8, 0.8, 0.8], color: '#ff00ff' });

function defaultAsset(d: EntityDef) {
  if (d.kind === 'player') return { sprite: { procedural: {} } };
  if (d.kind === 'npc') { const h = hash(d.id); return { sprite: { procedural: { shirt: `hsl(${h % 360} 60% 55%)`, hair: `hsl(${(h >> 8) % 60} 30% 25%)` } } }; }
  return { ref: d.name ?? d.id };
}

// ---------------------------------------------------------------- renderer
export interface RendererOptions {
  container: HTMLElement;
  resolver: AssetResolver;
  camera?: 'iso' | 'rpg';
  pixelScale?: number; // render at 1/N resolution then upscale (pixel look). 1 = off
  viewSize?: number; // visible tiles vertically
  canvas?: HTMLCanvasElement; // optional: render into your own canvas (R3F, existing page)
}

export class ThreeRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly keys: KeyboardInput;
  private gl: THREE.WebGLRenderer;
  private objs = new Map<string, THREE.Object3D>();
  private ring: THREE.Mesh;
  private yaw: number; private pitch: number; private viewSize: number; private px: number;
  private fwd: Vec2; private right: Vec2;
  private raf = 0; private last = 0; private click?: Vec2; private disposed = false;
  private ray = new THREE.Raycaster(); private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private target = new THREE.Vector3();

  constructor(private game: Game, private o: RendererOptions) {
    const mode = o.camera ?? game.pack.style?.camera ?? 'iso';
    this.yaw = mode === 'iso' ? Math.PI / 4 : 0;
    this.pitch = THREE.MathUtils.degToRad(mode === 'iso' ? 35.264 : 50);
    this.viewSize = o.viewSize ?? 11;
    this.px = Math.max(1, o.pixelScale ?? game.pack.style?.pixelScale ?? 1);
    const f: Vec2 = [-Math.sin(this.yaw), -Math.cos(this.yaw)]; // camera looks along -(sin, cos)
    this.fwd = f; this.right = [-f[1], f[0]];                    // right = forward x up

    this.scene.background = new THREE.Color(game.pack.style?.background ?? '#9ad1e8');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a8f, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-6, 12, 4); this.scene.add(sun);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
    this.gl = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: this.px === 1 });
    const cv = this.gl.domElement; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';
    if (this.px > 1) cv.style.imageRendering = 'pixelated';
    if (!o.canvas) o.container.appendChild(cv);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.scene.add(this.ring);

    this.keys = new KeyboardInput(game);
    cv.addEventListener('pointerdown', this.onPointer);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.setViewSize(this.viewSize * (e.deltaY > 0 ? 1.12 : 0.89)); }, { passive: false });
    addEventListener('resize', this.resize);
    game.events.on('toggle', ({ id, hidden }) => { const ob = this.objs.get(id); if (ob) ob.visible = !hidden; });
    this.resize();
  }

  /** Build terrain + resolve & instantiate every entity (async: assets may be fetched). */
  async init() {
    this.buildTerrain();
    await Promise.all([...this.game.entities.values()].filter((e) => e.kind !== 'trigger').map((e) => this.addEntity(e)));
    this.syncEntities();
    this.target.set(this.game.player.x, 0, this.game.player.y);
  }

  private buildTerrain() {
    const { width: W, height: H, rows, legend } = this.game.pack.map;
    const geo = new THREE.BoxGeometry(1, 0.3, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), W * H);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = legend[rows[y][x]];
      m.makeTranslation(x + 0.5, -0.15 + (t?.height ?? 0), y + 0.5);
      mesh.setMatrixAt(y * W + x, m);
      col.set(t?.color ?? '#ff00ff').multiplyScalar(0.94 + ((hash(`${x},${y}`) % 100) / 100) * 0.1);
      mesh.setColorAt(y * W + x, col);
    }
    this.scene.add(mesh);
  }

  private async addEntity(e: RuntimeEntity) {
    const res: Resolved = await this.o.resolver.resolve(e.def.asset ?? defaultAsset(e.def), e.kind);
    const root = new THREE.Group();
    switch (res.kind) {
      case 'shape': root.add(buildShape(res.spec)); break;
      case 'sprite': root.add(makeSprite(res.sprite, res.scale)); break;
      case 'gltf': {
        root.add(placeholder());
        new GLTFLoader().loadAsync(res.url).then((g) => { root.clear(); g.scene.scale.setScalar(res.scale); root.add(g.scene); }).catch((err) => console.warn('[gltf]', res.url, err));
        break;
      }
      default: root.add(placeholder());
    }
    if (e.kind === 'npc' || e.kind === 'player') root.add(blobShadow());
    root.userData.by = res.by;
    this.scene.add(root); this.objs.set(e.id, root);
  }

  private syncEntities() {
    const g = this.game;
    for (const e of g.entities.values()) {
      const o = this.objs.get(e.id); if (!o) continue;
      o.position.set(e.x, e.moving && (e.kind === 'npc' || e.kind === 'player') ? Math.abs(Math.sin(g.time * 14)) * 0.06 : 0, e.y);
      o.visible = !e.state.hidden;
    }
    const f = g.focus ? g.entities.get(g.focus) : undefined;
    this.ring.visible = !!f && !g.dialogue;
    if (f) { const s = f.def.size ?? [1, 1]; this.ring.position.set(f.x, 0.03, f.y); this.ring.scale.setScalar(Math.max(1, Math.max(s[0], s[1]) * 0.9)); }
  }

  private updateCamera(dt: number) {
    const p = this.game.player;
    this.target.lerp(new THREE.Vector3(p.x, 0, p.y), 1 - Math.pow(0.0005, dt));
    const d = 40, c = Math.cos(this.pitch);
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * c * d, Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * c * d);
    this.camera.lookAt(this.target);
  }

  /** Zoom: number of tiles visible vertically (wheel zoom calls this). */
  setViewSize(n: number) { this.viewSize = Math.min(120, Math.max(5, n)); this.resize(); }

  private resize = () => {
    const w = this.o.container.clientWidth || 800, h = this.o.container.clientHeight || 600, a = w / h;
    this.gl.setPixelRatio(1);
    this.gl.setSize(Math.max(1, Math.floor(w / this.px)), Math.max(1, Math.floor(h / this.px)), false);
    this.camera.left = (-this.viewSize * a) / 2; this.camera.right = (this.viewSize * a) / 2;
    this.camera.top = this.viewSize / 2; this.camera.bottom = -this.viewSize / 2;
    this.camera.updateProjectionMatrix();
  };

  /** Click-to-move: ray -> ground plane -> tile -> A* (handled by Game.moveTo). */
  private onPointer = (ev: PointerEvent) => {
    if (this.game.dialogue) return;
    const r = this.gl.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.ground, hit)) this.click = [Math.floor(hit.x), Math.floor(hit.z)];
  };

  start() {
    this.last = performance.now();
    const tick = (t: number) => {
      if (this.disposed) return;
      const dt = Math.min((t - this.last) / 1000, 0.1); this.last = t;
      const a = this.keys.axes();
      this.game.update(dt, {
        dx: a.x * this.right[0] + a.y * this.fwd[0], dy: a.x * this.right[1] + a.y * this.fwd[1],
        interact: this.keys.consumeInteract(), moveTo: this.click,
      });
      this.click = undefined;
      this.syncEntities(); this.updateCamera(dt);
      this.gl.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Which provider served each entity's asset (provenance / debugging). */
  assetReport() { return [...this.objs.entries()].map(([id, o]) => ({ id, by: o.userData.by as string })); }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize); this.keys.dispose(); this.gl.dispose(); this.gl.domElement.remove();
  }
}
