import * as THREE from "three";
import { TICK_RATE, TUNING } from "./sim/config";
import {
  countLitLanterns,
  createDefaultInput,
  createGame,
  getLanternLightRatio,
  getNearestReceivableLantern,
  getPlayerCapacity,
  getTimeLeftSeconds,
  isWithinLanternRange,
  isWindWarning,
  stepGame,
} from "./sim/game";
import type { GameEvent, GameState, InputState, Night } from "./sim/types";
import "./style.css";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required page element #${id}`);
  return element as T;
}

const root = requiredElement<HTMLDivElement>("game");
const hud = requiredElement<HTMLDivElement>("hud");
const overlay = requiredElement<HTMLElement>("overlay");
const flamesLabel = requiredElement<HTMLElement>("flames");
const nightLabel = requiredElement<HTMLElement>("night-title");
const timeLabel = requiredElement<HTMLTimeElement>("time");
const lanternsLabel = requiredElement<HTMLElement>("lanterns");
const scoreLabel = requiredElement<HTMLElement>("score");
const carryCount = requiredElement<HTMLElement>("carry-count");
const carrySlots = requiredElement<HTMLDivElement>("carry-slots");
const dashLabel = requiredElement<HTMLElement>("dash-cooldown");
const pulseLabel = requiredElement<HTMLElement>("pulse-cooldown");
const hint = requiredElement<HTMLDivElement>("hint");
const arrow = requiredElement<HTMLDivElement>("arrow");
const windWarning = requiredElement<HTMLDivElement>("wind-warning");
const loading = requiredElement<HTMLDivElement>("loading");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.className = "game-canvas";
root.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0E1430");
scene.fog = new THREE.FogExp2("#1B2350", 0.006);
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 7, -13);

const hemisphere = new THREE.HemisphereLight("#F5F1E6", "#12384A", 0.15);
scene.add(hemisphere);
const moonLight = new THREE.DirectionalLight("#F5F1E6", 0.7);
moonLight.position.set(-15, 35, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
scene.add(moonLight);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(180, 96),
  new THREE.MeshStandardMaterial({ color: "#12384A", roughness: 0.8, metalness: 0.12 }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = -1.5;
scene.add(water);

const worldGroup = new THREE.Group();
scene.add(worldGroup);
const lanternGroup = new THREE.Group();
scene.add(lanternGroup);

const playerGroup = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.38, 0.8, 4, 8),
  new THREE.MeshStandardMaterial({ color: "#E8E2D0", roughness: 0.84 }),
);
playerBody.position.y = 0.85;
playerBody.castShadow = true;
playerGroup.add(playerBody);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.33, 16, 12),
  new THREE.MeshStandardMaterial({ color: "#F5F1E6", roughness: 0.8 }),
);
head.position.y = 1.55;
head.castShadow = true;
playerGroup.add(head);
const hat = new THREE.Mesh(
  new THREE.ConeGeometry(0.58, 0.42, 12),
  new THREE.MeshStandardMaterial({ color: "#C9B48A", roughness: 0.92 }),
);
hat.position.y = 1.88;
hat.rotation.z = Math.PI;
hat.castShadow = true;
playerGroup.add(hat);
const scarf = new THREE.Mesh(
  new THREE.TorusGeometry(0.34, 0.09, 8, 18),
  new THREE.MeshStandardMaterial({ color: "#C8102E", roughness: 0.75 }),
);
scarf.position.y = 1.22;
scarf.rotation.x = Math.PI / 2;
playerGroup.add(scarf);
const playerLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 12, 8),
  new THREE.MeshStandardMaterial({ color: "#FFE9B0", emissive: "#FFB347", emissiveIntensity: 2 }),
);
playerLamp.position.set(0.38, 1.1, 0.25);
playerGroup.add(playerLamp);
playerGroup.add(new THREE.PointLight("#FFB347", 0.8, 7));
scene.add(playerGroup);

const keys = new Set<string>();
const lanternMeshes = new Map<string, {
  group: THREE.Group;
  glow: THREE.PointLight;
  flame: THREE.Mesh;
  fuelBackground: THREE.Mesh;
  fuelFill: THREE.Mesh;
  paperTear: THREE.Mesh;
}>();
const moteMeshes = new Map<string, THREE.Group>();
const shadeMeshes = new Map<string, {
  group: THREE.Group;
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  outline: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  eyes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
}>();
const drifterMeshes = new Map<string, THREE.Group>();
const charmMeshes = new Map<string, THREE.Group>();

type Screen = "menu" | "intro" | "play" | "result" | "settings";
type SettingsReturn = "menu" | "pause";

interface AudioState {
  context: AudioContext;
  master: GainNode;
  musicOscillators: OscillatorNode[];
}

const nightNames: Record<Night, string> = {
  1: "ĐẢO BẾN",
  2: "ĐẢO CAU",
  3: "ĐẢO CHUÔNG",
};

const stories: Record<Night, string> = {
  1: "Ông Đăng khẽ trao cho Mây chiếc đèn nhỏ: “Hãy gom ánh sáng, thắp lại những ngọn đèn trước khi bình minh tới.”",
  2: "Ông Đăng chỉ về phía cây cầu tre: “Đảo Cau đã tách đôi. Hãy lướt qua gió và giữ đom đóm an toàn.”",
  3: "Tiếng chuông vọng từ tầng mây cao: “Đêm cuối cùng đang đến. Đưa ánh sáng lên đỉnh đảo và gọi bình minh.”",
};

let game: GameState = createGame(Date.now() >>> 0);
let screen: Screen = "menu";
let settingsReturn: SettingsReturn = "menu";
let sessionActive = false;
let totalScore = 0;
let resultRecorded = false;
let resumeRequested = false;
let cameraYaw = 0;
let accumulator = 0;
let previousTime = performance.now();
let dragging = false;
let lastPointerX = 0;
let lastRenderedMode = "";
let lastCountdownSound = -1;
let audio: AudioState | undefined;
let warnedMissingAudio = false;
let volume = readSetting("dao-den-long.volume", 0.35, 0, 1);
let sensitivity = readSetting("dao-den-long.sensitivity", 0.35, 0.1, 1);
let colorblindMode = readBooleanSetting("dao-den-long.colorblind", false);

root.classList.toggle("colorblind-mode", colorblindMode);

function readBooleanSetting(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  return raw === "true" ? true : raw === "false" ? false : fallback;
}

function setColorblindMode(value: boolean): void {
  colorblindMode = value;
  root.classList.toggle("colorblind-mode", value);
  localStorage.setItem("dao-den-long.colorblind", String(value));
}

function readSetting(key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= minimum && stored <= maximum ? stored : fallback;
}

function setVolume(value: number): void {
  volume = value;
  localStorage.setItem("dao-den-long.volume", String(value));
  if (audio) audio.master.gain.setTargetAtTime(volume, audio.context.currentTime, 0.04);
}

function ensureAudio(): AudioState | undefined {
  if (typeof window.AudioContext === "undefined") {
    if (!warnedMissingAudio) {
      console.warn("Web Audio is unavailable; gameplay will continue without sound.");
      warnedMissingAudio = true;
    }
    return undefined;
  }
  if (!audio) {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    audio = { context, master, musicOscillators: [] };
  }
  if (audio.context.state === "suspended") {
    void audio.context.resume().catch((error: unknown) => {
      console.error("Could not resume the game audio context.", error);
    });
  }
  return audio;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine"): void {
  const state = ensureAudio();
  if (!state) return;
  const start = state.context.currentTime;
  const oscillator = state.context.createOscillator();
  const gain = state.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(state.master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function startMusic(): void {
  const state = ensureAudio();
  if (!state || state.musicOscillators.length > 0) return;
  for (const [frequency, level] of [[82.41, 0.08], [123.47, 0.04]]) {
    const oscillator = state.context.createOscillator();
    const gain = state.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = level;
    oscillator.connect(gain);
    gain.connect(state.master);
    oscillator.start();
    state.musicOscillators.push(oscillator);
  }
}

function handleAudioEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.name === "mote_picked" || event.name === "charm_picked") playTone(880, 0.12);
    else if (event.name === "refuel") playTone(740, 0.16);
    else if (event.name === "lantern_lit") {
      playTone(660, 0.18);
      playTone(990, 0.3);
    } else if (event.name === "lantern_out") playTone(150, 0.35, "triangle");
    else if (event.name === "pulse") playTone(220, 0.24, "triangle");
    else if (event.name === "player_hit") playTone(130, 0.32, "sawtooth");
    else if (event.name === "jump") playTone(520, 0.1);
    else if (event.name === "dash") playTone(330, 0.15, "triangle");
    else if (event.name === "shade_spawned") playTone(260, 0.22, "triangle");
    else if (event.name === "game_over" && event.data.result === "won") {
      playTone(523, 0.22);
      playTone(659, 0.28);
      playTone(784, 0.45);
    } else if (event.name === "game_over") {
      playTone(220, 0.25, "triangle");
      playTone(164, 0.45, "triangle");
    }
  }
}

function disposeTree(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  group.clear();
}

function addIsland(centerX: number, centerZ: number, radius: number, top: number): void {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 1, 1.5, 64),
    new THREE.MeshStandardMaterial({ color: "#C9B48A", roughness: 0.96 }),
  );
  base.position.set(centerX, top - 0.75, centerZ);
  base.receiveShadow = true;
  worldGroup.add(base);

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshStandardMaterial({ color: "#2F5D50", roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(centerX, top + 0.01, centerZ);
  grass.receiveShadow = true;
  worldGroup.add(grass);
}

function addTree(x: number, z: number): void {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.23, 1.4, 7),
    new THREE.MeshStandardMaterial({ color: "#6B4A2F", roughness: 1 }),
  );
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  tree.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: "#2F5D50", roughness: 1 }),
  );
  crown.position.y = 2.1;
  crown.castShadow = true;
  tree.add(crown);
  tree.position.set(x, 0, z);
  worldGroup.add(tree);
}

function addIslandTrees(centerX: number, centerZ: number, radius: number, amount: number): void {
  for (let index = 0; index < amount; index += 1) {
    const angle = (index / amount) * Math.PI * 2 + 0.14;
    const distance = radius * (0.72 + (index % 3) * 0.035);
    addTree(centerX + Math.cos(angle) * distance, centerZ + Math.sin(angle) * distance);
  }
}

function addRamp(degrees: number): void {
  const angle = (degrees * Math.PI) / 180;
  const along = [Math.cos(angle), Math.sin(angle)];
  const across = [-Math.sin(angle), Math.cos(angle)];
  const vertices = [
    30 * along[0] - 1.5 * across[0], 0.02, 30 * along[1] - 1.5 * across[1],
    30 * along[0] + 1.5 * across[0], 0.02, 30 * along[1] + 1.5 * across[1],
    24 * along[0] - 1.5 * across[0], 3.02, 24 * along[1] - 1.5 * across[1],
    24 * along[0] + 1.5 * across[0], 3.02, 24 * along[1] + 1.5 * across[1],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeVertexNormals();
  const ramp = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#C9B48A", side: THREE.DoubleSide, roughness: 0.9 }),
  );
  ramp.receiveShadow = true;
  worldGroup.add(ramp);
}

function addSpringPad(x: number, z: number, height = 0): void {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: "#F2C14E", emissive: "#FFB347", emissiveIntensity: 0.55 }),
  );
  pad.position.set(x, height + 0.08, z);
  pad.castShadow = true;
  worldGroup.add(pad);
}

function buildWorld(): void {
  disposeTree(worldGroup);
  if (game.night === 1) {
    addIsland(0, 0, 40, 0);
    addIslandTrees(0, 0, 33, 22);
  } else if (game.night === 2) {
    addIsland(0, 0, 28, 0);
    addIsland(70, 0, 28, 0);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: "#6B4A2F", roughness: 0.93 }),
    );
    bridge.position.set(35, -0.15, 0);
    bridge.receiveShadow = true;
    worldGroup.add(bridge);
    addSpringPad(20, 18);
    addSpringPad(50, -18);
    addIslandTrees(0, 0, 22, 12);
    addIslandTrees(70, 0, 22, 12);
  } else {
    addIsland(0, 0, 45, 0);
    const upperRing = new THREE.Mesh(
      new THREE.RingGeometry(12, 24, 96, 1, Math.PI, Math.PI),
      new THREE.MeshStandardMaterial({ color: "#2F5D50", side: THREE.DoubleSide, roughness: 1 }),
    );
    upperRing.rotation.x = -Math.PI / 2;
    upperRing.position.y = 3;
    upperRing.receiveShadow = true;
    worldGroup.add(upperRing);
    const summit = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 0.24, 64),
      new THREE.MeshStandardMaterial({ color: "#2F5D50", roughness: 1 }),
    );
    summit.position.y = 6;
    summit.receiveShadow = true;
    worldGroup.add(summit);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 8, 24),
      new THREE.MeshStandardMaterial({ color: "#6B4A2F", roughness: 0.82 }),
    );
    tower.position.set(0, 10, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    worldGroup.add(tower);
    addRamp(30);
    addRamp(150);
    addSpringPad(0, 13, 3);
    addIslandTrees(0, 0, 38, 24);
  }
}

function makeLantern(id: string, x: number, y: number, z: number): void {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#6B4A2F", roughness: 0.72 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.28, 12), bodyMaterial);
  base.position.y = 0.14;
  base.castShadow = true;
  group.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.9, 8), bodyMaterial);
  pole.position.y = 1.15;
  pole.castShadow = true;
  group.add(pole);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.55, 8), bodyMaterial);
  roof.position.y = 2.2;
  roof.rotation.y = Math.PI / 8;
  roof.castShadow = true;
  group.add(roof);
  const flame = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({ color: "#5B5F6E", emissive: "#5B5F6E", emissiveIntensity: 0.3 }),
  );
  flame.position.y = 1.88;
  group.add(flame);
  const glow = new THREE.PointLight("#FFB347", 0, 15, 2);
  glow.position.y = 1.85;
  group.add(glow);
  const fuelBackground = new THREE.Mesh(
    new THREE.BoxGeometry(1.34, 0.15, 0.06),
    new THREE.MeshBasicMaterial({ color: "#0E1430" }),
  );
  fuelBackground.position.set(0, 2.92, 0);
  const fuelFill = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: "#F2C14E" }),
  );
  fuelFill.position.set(0, 2.92, 0.04);
  const paperTear = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.26, 3),
    new THREE.MeshBasicMaterial({ color: "#0E1430" }),
  );
  paperTear.position.set(0.36, 1.78, 0.5);
  group.add(fuelBackground, fuelFill, paperTear);
  group.position.set(x, y, z);
  lanternGroup.add(group);
  lanternMeshes.set(id, { group, glow, flame, fuelBackground, fuelFill, paperTear });
}

function rebuildLanterns(): void {
  disposeTree(lanternGroup);
  lanternMeshes.clear();
  for (const lantern of game.lanterns) {
    makeLantern(lantern.id, lantern.pos[0], lantern.pos[1], lantern.pos[2]);
  }
}

function makeShade(): {
  group: THREE.Group;
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  outline: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  eyes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
} {
  const group = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 16, 12),
    new THREE.MeshStandardMaterial({ color: "#120A1A", emissive: "#120A1A", emissiveIntensity: 0.65 }),
  );
  orb.scale.set(1, 1.35, 0.85);
  orb.castShadow = true;
  group.add(orb);
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 12, 10),
    new THREE.MeshBasicMaterial({
      color: colorblindMode ? "#00B3FF" : "#7A3CFF",
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    }),
  );
  outline.scale.set(1, 1.35, 0.85);
  group.add(outline);
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: "#F5F1E6",
    emissive: colorblindMode ? "#00B3FF" : "#7A3CFF",
    emissiveIntensity: 1.8,
  });
  const eyes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMaterial);
    eye.position.set(x, 0.12, 0.54);
    group.add(eye);
    eyes.push(eye);
  }
  return { group, orb, outline, eyes };
}

function addMote(id: string): void {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshBasicMaterial({ color: "#FFE58A", transparent: true, opacity: 0.16, depthWrite: false }),
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: "#FFF6C2", emissive: "#FFE58A", emissiveIntensity: 1.8 }),
  );
  core.castShadow = true;
  group.add(halo, core);
  scene.add(group);
  moteMeshes.set(id, group);
}

function addDrifter(id: string): void {
  const group = new THREE.Group();
  const ribbon = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.42, 0.11, 48, 8, 2, 3),
    new THREE.MeshStandardMaterial({ color: "#8FA3B8", emissive: "#8FA3B8", emissiveIntensity: 0.55, roughness: 0.55 }),
  );
  ribbon.scale.set(1.2, 0.55, 0.65);
  ribbon.castShadow = true;
  group.add(ribbon);
  scene.add(group);
  drifterMeshes.set(id, group);
}

function addCharm(id: string): void {
  const group = new THREE.Group();
  const charm = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color: "#C8102E", emissive: "#C8102E", emissiveIntensity: 0.6 }),
  );
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(charm.geometry),
    new THREE.LineBasicMaterial({ color: "#F2C14E" }),
  );
  group.add(charm, rim);
  scene.add(group);
  charmMeshes.set(id, group);
}

function syncEntities(now: number): void {
  for (const mote of game.motes) {
    if (!moteMeshes.has(mote.id)) addMote(mote.id);
  }
  const activeMotes = new Set(game.motes.map((mote) => mote.id));
  for (const [id, mesh] of moteMeshes) {
    if (activeMotes.has(id)) continue;
    scene.remove(mesh);
    disposeTree(mesh);
    moteMeshes.delete(id);
  }
  for (const mote of game.motes) {
    const mesh = moteMeshes.get(mote.id);
    if (mesh) mesh.position.set(mote.pos[0], mote.pos[1] + 0.52 + Math.sin(now / 320 + mote.pos[0]) * 0.08, mote.pos[2]);
  }

  for (const shade of game.shades) {
    if (!shadeMeshes.has(shade.id)) {
      const mesh = makeShade();
      scene.add(mesh.group);
      shadeMeshes.set(shade.id, mesh);
    }
  }
  const activeShades = new Set(game.shades.map((shade) => shade.id));
  for (const [id, mesh] of shadeMeshes) {
    if (activeShades.has(id)) continue;
    scene.remove(mesh.group);
    disposeTree(mesh.group);
    shadeMeshes.delete(id);
  }
  for (const shade of game.shades) {
    const mesh = shadeMeshes.get(shade.id);
    if (!mesh) continue;
    mesh.group.position.set(shade.pos[0], shade.pos[1], shade.pos[2]);
    mesh.group.lookAt(game.player.pos[0], game.player.pos[1], game.player.pos[2]);
    mesh.orb.material.color.set(shade.state === "stunned" ? "#3A3450" : "#120A1A");
    mesh.orb.material.emissive.set(shade.state === "stunned" ? "#3A3450" : "#120A1A");
    const accent = colorblindMode ? "#00B3FF" : "#7A3CFF";
    mesh.outline.material.color.set(accent);
    for (const eye of mesh.eyes) eye.material.emissive.set(accent);
  }

  for (const drifter of game.drifters) {
    if (!drifterMeshes.has(drifter.id)) addDrifter(drifter.id);
  }
  const activeDrifters = new Set(game.drifters.map((drifter) => drifter.id));
  for (const [id, mesh] of drifterMeshes) {
    if (activeDrifters.has(id)) continue;
    scene.remove(mesh);
    disposeTree(mesh);
    drifterMeshes.delete(id);
  }
  for (const drifter of game.drifters) {
    const mesh = drifterMeshes.get(drifter.id);
    if (!mesh) continue;
    mesh.position.set(drifter.pos[0], drifter.pos[1] + 0.2, drifter.pos[2]);
    mesh.rotation.y += drifter.state === "flee" ? 0.14 : 0.04;
  }

  for (const charm of game.charms) {
    if (!charmMeshes.has(charm.id)) addCharm(charm.id);
    const mesh = charmMeshes.get(charm.id);
    if (!mesh) continue;
    mesh.visible = charm.available;
    mesh.position.set(charm.pos[0], charm.pos[1] + 0.65 + Math.sin(now / 260) * 0.08, charm.pos[2]);
    mesh.rotation.y += 0.025;
  }
}

function getInput(): InputState {
  let x = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  let z = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const magnitude = Math.hypot(x, z);
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }
  return {
    ...createDefaultInput(),
    move: [x, z],
    cam_yaw_deg: cameraYaw,
    jump: keys.has("Space"),
    interact: keys.has("KeyE"),
    pulse: keys.has("KeyQ"),
    dash: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    pause: resumeRequested || (screen !== "settings" && (keys.has("Escape") || keys.has("KeyP"))),
  };
}

function formatSeconds(value: number): string {
  return (value / TICK_RATE).toFixed(1);
}

function updateLanternArrow(): void {
  const lantern = getNearestReceivableLantern(game);
  if (!lantern) {
    arrow.hidden = true;
    return;
  }
  const world = new THREE.Vector3(lantern.pos[0], lantern.pos[1] + 1.5, lantern.pos[2]).project(camera);
  let dx = world.x;
  let dy = -world.y;
  if (world.z > 1) {
    dx *= -1;
    dy *= -1;
  }
  if (Math.abs(dx) <= 0.88 && Math.abs(dy) <= 0.82 && world.z <= 1) {
    arrow.hidden = true;
    return;
  }
  const directionLength = Math.hypot(dx, dy) || 1;
  dx /= directionLength;
  dy /= directionLength;
  const edgeX = Math.max(34, window.innerWidth / 2 - 36);
  const edgeY = Math.max(70, window.innerHeight / 2 - 60);
  const scale = Math.min(edgeX / Math.max(0.001, Math.abs(dx)), edgeY / Math.max(0.001, Math.abs(dy)));
  arrow.style.left = `${window.innerWidth / 2 + dx * scale}px`;
  arrow.style.top = `${window.innerHeight / 2 + dy * scale}px`;
  arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`;
  const label = arrow.querySelector("small");
  if (label) label.textContent = lantern.id;
  arrow.hidden = false;
}

function updateHud(): void {
  const seconds = Math.max(0, Math.ceil(getTimeLeftSeconds(game)));
  const minutes = Math.floor(seconds / 60);
  timeLabel.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  timeLabel.classList.toggle("urgent", seconds <= 30);
  nightLabel.textContent = `ĐÊM ${game.night} · ${nightNames[game.night]}`;
  flamesLabel.textContent = "✦ ".repeat(Math.max(0, game.player.flames)).trim() || "0";
  lanternsLabel.textContent = `${countLitLanterns(game)} / ${game.lanterns.length}`;
  scoreLabel.textContent = String(game.score);
  const capacity = getPlayerCapacity(game);
  carryCount.textContent = `ĐOM ĐÓM ${game.player.carried}/${capacity}`;
  carrySlots.setAttribute("aria-label", `Đom đóm đang mang ${game.player.carried} trên ${capacity}`);
  carrySlots.innerHTML = Array.from({ length: capacity }, (_, index) =>
    `<span class="mote-slot${index < game.player.carried ? " filled" : ""}"></span>`,
  ).join("");
  dashLabel.textContent = game.player.dashCooldownTicks > 0
    ? `LƯỚT ${formatSeconds(game.player.dashCooldownTicks)}s`
    : "LƯỚT SẴN SÀNG";
  pulseLabel.textContent = game.player.pulseCooldownTicks > 0
    ? `TỎA SÁNG ${formatSeconds(game.player.pulseCooldownTicks)}s`
    : `TỎA SÁNG ${game.player.carried >= TUNING.pulse_cost ? "SẴN SÀNG" : "3 ĐOM ĐÓM"}`;

  const nearbyLantern = getNearestReceivableLantern(game);
  const action = nearbyLantern?.lit ? "Châm dầu" : "Nạp ánh sáng";
  hint.textContent = nearbyLantern && isWithinLanternRange(game.player.pos, nearbyLantern)
    ? `E — ${action} (${game.player.carried}/${capacity})`
    : "";
  windWarning.hidden = !isWindWarning(game);
  windWarning.textContent = `${colorblindMode ? "⚠ " : ""}GIÓ MẠNH SẮP ĐẾN`;
  updateLanternArrow();
}

function screenMarkup(mode: Screen | "pause"): string {
  if (mode === "menu") {
    return `<article class="panel">
      <p class="eyebrow">Day 12 · AI SDLC · Phase 3</p>
      <h1>ĐẢO ĐÈN LỒNG</h1>
      <h2>Ba hòn đảo · Ba đêm</h2>
      <p class="story">Mây phải giữ đảo sáng tới bình minh: thu gom đom đóm, thắp và châm dầu cho đèn, rồi ngăn Bóng Mực hút cạn ánh sáng.</p>
      <div class="menu-actions">
        <button class="game-button" data-action="start">Bắt đầu hành trình</button>
        <button class="game-button secondary" data-action="settings">Cài đặt</button>
      </div>
      <p class="story">WASD di chuyển · Space nhảy · Shift lướt · E nạp đèn · Q tỏa sáng · Esc/P tạm dừng</p>
    </article>`;
  }
  if (mode === "intro") {
    return `<article class="panel">
      <p class="eyebrow">Đêm ${game.night} / 3</p>
      <h1>${nightNames[game.night]}</h1>
      <p class="story">${stories[game.night]}</p>
      <div class="menu-actions">
        <button class="game-button" data-action="begin">Bắt đầu Đêm ${game.night}</button>
        <button class="game-button secondary" data-action="menu">Về menu</button>
      </div>
    </article>`;
  }
  if (mode === "pause") {
    return `<article class="panel">
      <p class="eyebrow">Đêm ${game.night} · ${nightNames[game.night]}</p>
      <h1>TẠM DỪNG</h1>
      <p class="story">Thời gian và mọi chuyển động đang dừng lại.</p>
      <div class="menu-actions">
        <button class="game-button" data-action="continue">Tiếp tục</button>
        <button class="game-button secondary" data-action="retry">Chơi lại Đêm</button>
        <button class="game-button secondary" data-action="settings">Cài đặt</button>
        <button class="game-button secondary" data-action="menu">Về menu</button>
      </div>
    </article>`;
  }
  if (mode === "settings") {
    return `<article class="panel">
      <p class="eyebrow">Cài đặt · được lưu trên thiết bị</p>
      <h1>ÂM THANH & HIỂN THỊ</h1>
      <label class="range-field"><span>Âm lượng <output id="volume-value">${Math.round(volume * 100)}%</output></span>
        <input id="volume-setting" type="range" min="0" max="1" step="0.01" value="${volume}"></label>
      <label class="range-field"><span>Độ nhạy chuột <output id="sensitivity-value">${Math.round(sensitivity * 100)}%</output></span>
        <input id="sensitivity-setting" type="range" min="0.1" max="1" step="0.01" value="${sensitivity}"></label>
      <label class="check-field"><span>Bảng màu dễ phân biệt</span>
        <input id="colorblind-setting" type="checkbox"${colorblindMode ? " checked" : ""}></label>
      <div class="menu-actions">
        <button class="game-button" data-action="settings-back">Quay lại</button>
      </div>
    </article>`;
  }
  if (game.status === "won" && game.night === 3) {
    return `<article class="panel">
      <p class="eyebrow">Mây đã giữ đủ ánh sáng tới bình minh</p>
      <h1>BÌNH MINH</h1>
      <p class="story">Tổng điểm ba Đêm: <strong>${totalScore}</strong></p>
      <div class="menu-actions"><button class="game-button" data-action="menu">Về menu</button></div>
    </article>`;
  }
  if (game.status === "won") {
    return `<article class="panel">
      <p class="eyebrow">Đêm ${game.night} hoàn thành</p>
      <h1>GIỮ SÁNG TỚI BÌNH MINH</h1>
      <p class="story">Đèn còn sáng: ${countLitLanterns(game)} / ${game.lanterns.length} · Điểm Đêm này: ${game.score} · Tổng điểm: ${totalScore}</p>
      <div class="menu-actions">
        <button class="game-button" data-action="next">Đi tiếp Đêm ${game.night + 1}</button>
        <button class="game-button secondary" data-action="menu">Về menu</button>
      </div>
    </article>`;
  }
  return `<article class="panel">
    <p class="eyebrow">Đêm ${game.night} · ${nightNames[game.night]}</p>
    <h1>${game.reason === "dawn" ? "BÌNH MINH ĐÃ ĐẾN" : "ĐÊM TỐI THẮNG"}</h1>
    <p class="story">${game.reason === "dawn" ? `Chỉ còn ${countLitLanterns(game)} / ${game.lanterns.length} đèn sáng; cần ${Math.ceil(TUNING.win_ratio * game.lanterns.length)} để giữ đảo đến bình minh.` : `Mây còn ${game.player.flames} Ngọn Lửa.`} Điểm đang có: ${game.score}. Hãy thử lại Đêm này.</p>
    <div class="menu-actions">
      <button class="game-button" data-action="retry">Chơi lại Đêm ${game.night}</button>
      <button class="game-button secondary" data-action="menu">Về menu</button>
    </div>
  </article>`;
}

function renderScreen(): void {
  const mode: Screen | "pause" = sessionActive && game.status === "paused" && screen === "play"
    ? "pause"
    : screen;
  if (mode === "play") {
    if (!overlay.hidden) {
      overlay.hidden = true;
      overlay.innerHTML = "";
    }
    hud.hidden = false;
    lastRenderedMode = "play";
    return;
  }
  hud.hidden = !(sessionActive && (screen === "settings" || game.status === "paused"));
  if (mode === lastRenderedMode) return;
  overlay.innerHTML = screenMarkup(mode);
  overlay.hidden = false;
  lastRenderedMode = mode;
}

function resetEntityMeshes(): void {
  for (const group of moteMeshes.values()) {
    scene.remove(group);
    disposeTree(group);
  }
  for (const mesh of shadeMeshes.values()) {
    scene.remove(mesh.group);
    disposeTree(mesh.group);
  }
  for (const group of drifterMeshes.values()) {
    scene.remove(group);
    disposeTree(group);
  }
  for (const group of charmMeshes.values()) {
    scene.remove(group);
    disposeTree(group);
  }
  moteMeshes.clear();
  shadeMeshes.clear();
  drifterMeshes.clear();
  charmMeshes.clear();
}

function loadNight(night: Night): void {
  game = createGame(Date.now() >>> 0, undefined, night);
  resultRecorded = false;
  resumeRequested = false;
  cameraYaw = 0;
  keys.clear();
  accumulator = 0;
  sessionActive = false;
  screen = "intro";
  resetEntityMeshes();
  buildWorld();
  rebuildLanterns();
  renderScreen();
}

function startNewRun(): void {
  totalScore = 0;
  loadNight(1);
}

function returnToMenu(): void {
  totalScore = 0;
  game = createGame(Date.now() >>> 0);
  sessionActive = false;
  screen = "menu";
  resultRecorded = false;
  resetEntityMeshes();
  buildWorld();
  rebuildLanterns();
  renderScreen();
}

function beginNight(): void {
  sessionActive = true;
  screen = "play";
  keys.clear();
  startMusic();
  playTone(440, 0.18);
  lastCountdownSound = -1;
  renderScreen();
}

function handleGameOver(): void {
  if (resultRecorded || (game.status !== "won" && game.status !== "lost")) return;
  resultRecorded = true;
  if (game.status === "won") totalScore += game.score;
  screen = "result";
  sessionActive = false;
  renderScreen();
}

function updateSettingsInput(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === "volume-setting") {
    const nextVolume = Number(target.value);
    setVolume(nextVolume);
    const output = document.getElementById("volume-value");
    if (output) output.textContent = `${Math.round(volume * 100)}%`;
  } else if (target.id === "sensitivity-setting") {
    sensitivity = Number(target.value);
    localStorage.setItem("dao-den-long.sensitivity", String(sensitivity));
    const output = document.getElementById("sensitivity-value");
    if (output) output.textContent = `${Math.round(sensitivity * 100)}%`;
  } else if (target.id === "colorblind-setting") {
    setColorblindMode(target.checked);
  }
}

overlay.addEventListener("input", (event) => updateSettingsInput(event.target));
overlay.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
  const action = button?.dataset.action;
  if (!action) return;
  if (action === "start") startNewRun();
  else if (action === "begin") beginNight();
  else if (action === "continue") {
    screen = "play";
    game.previousInput.pause = false;
    resumeRequested = true;
    renderScreen();
  } else if (action === "next") loadNight((game.night + 1) as Night);
  else if (action === "retry") loadNight(game.night);
  else if (action === "menu") returnToMenu();
  else if (action === "settings") {
    settingsReturn = screen === "menu" ? "menu" : "pause";
    screen = "settings";
    lastRenderedMode = "";
    renderScreen();
  } else if (action === "settings-back") {
    screen = settingsReturn === "menu" ? "menu" : "play";
    lastRenderedMode = "";
    renderScreen();
  }
});

function updateWorldAndCamera(now: number): void {
  syncEntities(now);
  playerGroup.position.set(game.player.pos[0], game.player.pos[1], game.player.pos[2]);
  playerGroup.rotation.y = game.player.facingYaw;
  playerGroup.visible = game.player.respawnTicksLeft === 0;
  for (const lantern of game.lanterns) {
    const meshes = lanternMeshes.get(lantern.id);
    if (!meshes) continue;
    const flameMaterial = meshes.flame.material as THREE.MeshStandardMaterial;
    const fuelRatio = lantern.fuelUnits / (TUNING.fuel_max * TICK_RATE);
    const lowFuel = lantern.lit && lantern.fuelUnits < TUNING.low_fuel_threshold * TICK_RATE;
    const blinkOn = !lowFuel || Math.floor(now / 500) % 2 === 0;
    const fuelBarColor = colorblindMode && lowFuel ? "#FFFFFF" : lowFuel ? "#FF5A5F" : "#F2C14E";
    meshes.group.scale.y = lantern.lit ? 1 : 0.8;
    meshes.paperTear.visible = !lantern.lit;
    meshes.fuelBackground.visible = lantern.lit && blinkOn;
    meshes.fuelFill.visible = lantern.lit && blinkOn;
    meshes.fuelFill.scale.x = Math.max(0.001, fuelRatio);
    meshes.fuelFill.position.x = -0.6 + 0.6 * fuelRatio;
    (meshes.fuelFill.material as THREE.MeshBasicMaterial).color.set(fuelBarColor);
    flameMaterial.color.set(lantern.lit ? "#FFE9B0" : "#5B5F6E");
    flameMaterial.emissive.set(lantern.lit ? "#FFB347" : "#5B5F6E");
    flameMaterial.emissiveIntensity = lantern.lit ? 2.8 * fuelRatio : 0.3;
    meshes.flame.visible = lantern.lit && blinkOn;
    meshes.glow.intensity = lantern.lit && blinkOn ? 3.8 * fuelRatio : 0;
  }
  const lightLevel = 0.15 + 0.55 * getLanternLightRatio(game);
  hemisphere.intensity = lightLevel;
  const distance = 12;
  const height = 5.2;
  const yaw = (cameraYaw * Math.PI) / 180;
  const targetX = game.player.pos[0] - Math.sin(yaw) * distance;
  const targetZ = game.player.pos[2] - Math.cos(yaw) * distance;
  camera.position.lerp(new THREE.Vector3(targetX, game.player.pos[1] + height, targetZ), 0.12);
  camera.lookAt(game.player.pos[0], game.player.pos[1] + 1.05, game.player.pos[2]);
}

function updateCountdownAudio(): void {
  const seconds = Math.ceil(getTimeLeftSeconds(game));
  if (seconds <= 10 && seconds > 0 && seconds !== lastCountdownSound) {
    playTone(960, 0.08);
    lastCountdownSound = seconds;
  }
}

function renderFrame(now: number): void {
  const delta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  accumulator += delta;
  const fixedStep = 1 / TICK_RATE;

  while (accumulator >= fixedStep && sessionActive && (game.status === "playing" || game.status === "paused")) {
    const wasWindActive = game.wind.active;
    const events = stepGame(game, getInput());
    handleAudioEvents(events);
    if (!wasWindActive && game.wind.active) playTone(174, 0.32, "triangle");
    if (resumeRequested) resumeRequested = false;
    updateCountdownAudio();
    accumulator -= fixedStep;
    handleGameOver();
  }

  updateWorldAndCamera(now);
  updateHud();
  renderScreen();
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  if (!event.repeat) keys.add(event.code);
  if (event.code === "KeyR" && (game.status === "won" || game.status === "lost")) loadNight(game.night);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
renderer.domElement.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPointerX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  cameraYaw -= (event.clientX - lastPointerX) * sensitivity;
  lastPointerX = event.clientX;
});
renderer.domElement.addEventListener("pointerup", () => {
  dragging = false;
});
renderer.domElement.addEventListener("pointercancel", () => {
  dragging = false;
});
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildWorld();
rebuildLanterns();
loading.remove();
renderScreen();
requestAnimationFrame(renderFrame);
