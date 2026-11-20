import * as THREE from "three";
import { LANTERN_POSITIONS, TICK_RATE, TUNING } from "./sim/config";
import { countLitLanterns, createGame, getTimeLeftSeconds, stepGame } from "./sim/game";
import type { GameState, InputState } from "./sim/types";
import "./style.css";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required page element #${id}`);
  return element as T;
}

const root = requiredElement<HTMLDivElement>("game");
const loading = requiredElement<HTMLDivElement>("loading");
const message = requiredElement<HTMLDivElement>("message");
const restartButton = requiredElement<HTMLButtonElement>("restart");
const lanternsLabel = requiredElement<HTMLElement>("lanterns");
const carriedLabel = requiredElement<HTMLElement>("carried");
const flamesLabel = requiredElement<HTMLElement>("flames");
const timeLabel = requiredElement<HTMLElement>("time");
const scoreLabel = requiredElement<HTMLElement>("score");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.className = "game-canvas";
root.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#10172d");
scene.fog = new THREE.FogExp2("#10172d", 0.012);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 6, -12);

scene.add(new THREE.HemisphereLight("#b5c8ff", "#243049", 1.35));
const moonLight = new THREE.DirectionalLight("#b8c5ff", 1.6);
moonLight.position.set(-15, 28, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
scene.add(moonLight);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(80, 96),
  new THREE.MeshStandardMaterial({ color: "#111b37", roughness: 0.8, metalness: 0.15 }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = -1.35;
scene.add(water);

const island = new THREE.Mesh(
  new THREE.CylinderGeometry(30, 31, 1.2, 96),
  new THREE.MeshStandardMaterial({ color: "#344c4b", roughness: 0.92 }),
);
island.position.y = -0.62;
island.receiveShadow = true;
scene.add(island);

const grass = new THREE.Mesh(
  new THREE.CircleGeometry(29.6, 96),
  new THREE.MeshStandardMaterial({ color: "#5c805d", roughness: 1 }),
);
grass.rotation.x = -Math.PI / 2;
grass.position.y = 0.005;
grass.receiveShadow = true;
scene.add(grass);

const pathMaterial = new THREE.MeshStandardMaterial({ color: "#8f8067", roughness: 1 });
for (let index = 0; index < LANTERN_POSITIONS.length; index += 1) {
  const lanternPos = LANTERN_POSITIONS[index];
  const path = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.25, 32),
    pathMaterial,
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(lanternPos[0], 0.015, lanternPos[2]);
  scene.add(path);
}

const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: "#594331", roughness: 1 });
const treeLeavesMaterial = new THREE.MeshStandardMaterial({ color: "#375c50", roughness: 1 });
for (let index = 0; index < 22; index += 1) {
  const angle = (index / 22) * Math.PI * 2 + 0.14;
  const radius = 23 + (index % 3) * 1.5;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 1.4, 7), treeTrunkMaterial);
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  tree.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1 + (index % 2) * 0.2, 2.5, 8), treeLeavesMaterial);
  crown.position.y = 2.1;
  crown.castShadow = true;
  tree.add(crown);
  tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  scene.add(tree);
}

const lanternMeshes = new Map<string, { glow: THREE.PointLight; body: THREE.Mesh; flame: THREE.Mesh }>();
const playerGroup = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.38, 0.8, 4, 8),
  new THREE.MeshStandardMaterial({ color: "#e5bf91", roughness: 0.82 }),
);
playerBody.position.y = 0.85;
playerBody.castShadow = true;
playerGroup.add(playerBody);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.33, 16, 12),
  new THREE.MeshStandardMaterial({ color: "#f0ccaa", roughness: 0.8 }),
);
head.position.y = 1.55;
head.castShadow = true;
playerGroup.add(head);
const hat = new THREE.Mesh(
  new THREE.ConeGeometry(0.58, 0.42, 12),
  new THREE.MeshStandardMaterial({ color: "#b88148", roughness: 0.92 }),
);
hat.position.y = 1.88;
hat.rotation.z = Math.PI;
hat.castShadow = true;
playerGroup.add(hat);
const playerLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 12, 8),
  new THREE.MeshStandardMaterial({ color: "#ffbf5d", emissive: "#ff8c28", emissiveIntensity: 2.2 }),
);
playerLamp.position.set(0.38, 1.1, 0.25);
playerGroup.add(playerLamp);
const playerGlow = new THREE.PointLight("#ffb85b", 1.1, 7);
playerGlow.position.copy(playerLamp.position);
playerGroup.add(playerGlow);
scene.add(playerGroup);

const moteMeshes = new Map<string, THREE.Mesh>();
const shadeMeshes = new Map<
  string,
  { group: THREE.Group; orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> }
>();
const keys = new Set<string>();
let game: GameState = createGame(Date.now() >>> 0);
let cameraYaw = 0;
let accumulator = 0;
let previousTime = performance.now();
let dragging = false;
let lastPointerX = 0;

const lanternBodyMaterial = new THREE.MeshStandardMaterial({
  color: "#855d43",
  roughness: 0.72,
  metalness: 0.12,
});
const unlitFlameMaterial = new THREE.MeshStandardMaterial({
  color: "#433d42",
  emissive: "#211b27",
  emissiveIntensity: 0.3,
});
const litFlameMaterial = new THREE.MeshStandardMaterial({
  color: "#ffcb68",
  emissive: "#ff8c24",
  emissiveIntensity: 3.2,
});

for (const lantern of game.lanterns) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.28, 12), lanternBodyMaterial);
  base.position.y = 0.14;
  base.castShadow = true;
  group.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.9, 8), lanternBodyMaterial);
  pole.position.y = 1.15;
  pole.castShadow = true;
  group.add(pole);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.55, 8), lanternBodyMaterial);
  roof.position.y = 2.2;
  roof.rotation.y = Math.PI / 8;
  roof.castShadow = true;
  group.add(roof);
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), unlitFlameMaterial);
  flame.position.y = 1.88;
  group.add(flame);
  const glow = new THREE.PointLight("#ffb856", 0, 13, 2);
  glow.position.y = 1.85;
  group.add(glow);
  group.position.set(lantern.pos[0], 0, lantern.pos[2]);
  scene.add(group);
  lanternMeshes.set(lantern.id, { glow, body: pole, flame });
}

function makeShade(): {
  group: THREE.Group;
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
} {
  const group = new THREE.Group();
  const orb = new THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>(
    new THREE.SphereGeometry(0.68, 16, 12),
    new THREE.MeshStandardMaterial({ color: "#34234e", emissive: "#241035", emissiveIntensity: 0.7 }),
  );
  orb.scale.set(1, 1.35, 0.85);
  orb.castShadow = true;
  group.add(orb);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#e3a9ff", emissive: "#b657ff", emissiveIntensity: 2 });
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMaterial);
    eye.position.set(x, 0.12, 0.54);
    group.add(eye);
  }
  return { group, orb };
}

function getInput(): InputState {
  let x = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  let z = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const magnitude = Math.hypot(x, z);
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }
  return {
    move: [x, z],
    cam_yaw_deg: cameraYaw,
    jump: keys.has("Space"),
    interact: keys.has("KeyE"),
    pulse: keys.has("KeyQ"),
  };
}

function syncEntities(): void {
  for (const mote of game.motes) {
    if (moteMeshes.has(mote.id)) continue;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshStandardMaterial({ color: "#ffe89a", emissive: "#ffbc48", emissiveIntensity: 1.8 }),
    );
    mesh.castShadow = true;
    scene.add(mesh);
    moteMeshes.set(mote.id, mesh);
  }
  const activeMotes = new Set(game.motes.map((mote) => mote.id));
  for (const [id, mesh] of moteMeshes) {
    if (activeMotes.has(id)) continue;
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    moteMeshes.delete(id);
  }

  for (const shade of game.shades) {
    if (shadeMeshes.has(shade.id)) continue;
    const mesh = makeShade();
    scene.add(mesh.group);
    shadeMeshes.set(shade.id, mesh);
  }
}

function updateHud(): void {
  lanternsLabel.textContent = `${countLitLanterns(game)} / ${game.lanterns.length}`;
  carriedLabel.textContent = `${game.player.carried} / ${TUNING.carry_capacity}`;
  flamesLabel.textContent = "✦ ".repeat(Math.max(0, game.player.flames)).trim() || "0";
  const seconds = Math.max(0, Math.ceil(getTimeLeftSeconds(game)));
  timeLabel.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  scoreLabel.textContent = String(game.score);

  if (game.status === "playing") {
    message.hidden = true;
    restartButton.hidden = true;
  } else {
    message.hidden = false;
    const result = game.status === "won" ? "ĐẢO SÁNG RỒI!" : "ĐÊM TỐI THẮNG";
    const reason = game.reason === "dawn"
      ? "Bình minh đã đến."
      : game.reason === "no_flames"
        ? "Mây đã cạn ánh sáng."
        : "Năm Đèn Lồng Lớn đã được thắp.";
    message.innerHTML = `<strong>${result}</strong><span>${reason} · ${game.score} điểm</span>`;
    restartButton.hidden = false;
  }
}

function renderFrame(now: number): void {
  const delta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  accumulator += delta;
  const fixedStep = 1 / TICK_RATE;

  while (accumulator >= fixedStep && game.status === "playing") {
    stepGame(game, getInput());
    accumulator -= fixedStep;
  }

  syncEntities();
  playerGroup.position.set(game.player.pos[0], game.player.pos[1], game.player.pos[2]);
  for (const lantern of game.lanterns) {
    const meshes = lanternMeshes.get(lantern.id);
    if (!meshes) continue;
    meshes.flame.material = lantern.lit ? litFlameMaterial : unlitFlameMaterial;
    meshes.glow.intensity = lantern.lit ? 4.5 : 0;
  }
  for (const mote of game.motes) {
    const mesh = moteMeshes.get(mote.id);
    if (mesh) {
      mesh.position.set(mote.pos[0], 0.48 + Math.sin(now / 320 + mote.pos[0]) * 0.09, mote.pos[2]);
    }
  }
  for (const shade of game.shades) {
    const mesh = shadeMeshes.get(shade.id);
    if (!mesh) continue;
    mesh.group.position.set(shade.pos[0], shade.pos[1], shade.pos[2]);
    mesh.group.lookAt(game.player.pos[0], game.player.pos[1], game.player.pos[2]);
    mesh.orb.material.color.set(shade.state === "stunned" ? "#8f82a5" : "#34234e");
  }

  const cameraDistance = 11;
  const cameraHeight = 5.2;
  const targetX = game.player.pos[0] - Math.sin((cameraYaw * Math.PI) / 180) * cameraDistance;
  const targetZ = game.player.pos[2] - Math.cos((cameraYaw * Math.PI) / 180) * cameraDistance;
  camera.position.lerp(new THREE.Vector3(targetX, game.player.pos[1] + cameraHeight, targetZ), 0.12);
  camera.lookAt(game.player.pos[0], game.player.pos[1] + 1.05, game.player.pos[2]);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

function restartGame(): void {
  game = createGame(Date.now() >>> 0);
  cameraYaw = 0;
  keys.clear();
  for (const mesh of moteMeshes.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  moteMeshes.clear();
  for (const mesh of shadeMeshes.values()) scene.remove(mesh.group);
  shadeMeshes.clear();
  accumulator = 0;
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyR" && game.status !== "playing") restartGame();
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
restartButton.addEventListener("click", restartGame);
renderer.domElement.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPointerX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  cameraYaw -= (event.clientX - lastPointerX) * 0.35;
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

loading.remove();
requestAnimationFrame(renderFrame);
