import {
  ISLAND_RADIUS,
  LANTERN_POSITIONS,
  NIGHT2_LANTERN_POSITIONS,
  NIGHT3_LANTERN_POSITIONS,
  TICK_RATE,
  TUNING,
} from "./config";
import { nextRandom } from "./random";
import type {
  Charm,
  Drifter,
  GameEvent,
  GameState,
  InputState,
  Lantern,
  Mote,
  Night,
  Player,
  Scenario,
  Shade,
  SpawnPad,
  Vec3,
} from "./types";

const INITIAL_MOTE_COUNT = 20;
const MAX_MOTES = 30;
const MAX_SHADES: Record<Night, number> = { 1: 6, 2: 8, 3: 10 };
const MAX_DRIFTERS = 2;
const WIND_PERIOD_TICKS = 30 * TICK_RATE;
const WIND_DURATION_TICKS = 5 * TICK_RATE;
const SHADE_SPAWN_POINTS_NIGHT1 = 12;

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function distance3d(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function clonePos(pos: Vec3): Vec3 {
  return [pos[0], pos[1], pos[2]];
}

function cloneInput(input: InputState): InputState {
  return {
    move: [input.move[0], input.move[1]],
    cam_yaw_deg: input.cam_yaw_deg,
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
    dash: input.dash,
    pause: input.pause,
  };
}

function positionAt(radius: number, degrees: number, centerX = 0, centerZ = 0, y = 0): Vec3 {
  const radians = (degrees * Math.PI) / 180;
  return [centerX + Math.cos(radians) * radius, y, centerZ + Math.sin(radians) * radius];
}

function getMoteSpawnPoints(night: Night): Vec3[] {
  if (night === 1) {
    return [
      ...Array.from({ length: 8 }, (_, index) => positionAt(12, index * 45)),
      ...Array.from({ length: 16 }, (_, index) => positionAt(33, index * 22.5)),
    ];
  }
  if (night === 2) {
    const points: Vec3[] = [];
    for (const centerX of [0, 70]) {
      points.push(...[0, 90, 180, 270].map((angle) => positionAt(10, angle, centerX)));
      points.push(...Array.from({ length: 8 }, (_, index) => positionAt(22, index * 45, centerX)));
    }
    return points;
  }
  return [
    ...Array.from({ length: 18 }, (_, index) => positionAt(34, index * 20)),
    ...Array.from({ length: 8 }, (_, index) => positionAt(18, (index + 1) * 20, 0, 0, 3)),
    ...[45, 135, 225, 315].map((angle) => positionAt(5, angle, 0, 0, 6)),
  ];
}

function getShadeSpawnPoints(night: Night): Vec3[] {
  if (night === 1) {
    return Array.from({ length: SHADE_SPAWN_POINTS_NIGHT1 }, (_, index) =>
      positionAt(37, 15 + index * 30, 0, 0, 1),
    );
  }
  if (night === 2) {
    return [0, 70].flatMap((centerX) =>
      Array.from({ length: 8 }, (_, index) => positionAt(26, 22.5 + index * 45, centerX, 0, 1)),
    );
  }
  return Array.from({ length: 16 }, (_, index) => positionAt(43, index * 22.5, 0, 0, 1));
}

function getDefaultCharms(night: Night): Charm[] {
  if (night === 2) {
    return [{ id: "C1", pos: [35, 0, 0], available: true, respawnTicksLeft: 0 }];
  }
  if (night === 3) {
    return [
      { id: "C1", pos: [30, 0, 25], available: true, respawnTicksLeft: 0 },
      { id: "C2", pos: [-30, 0, 25], available: true, respawnTicksLeft: 0 },
    ];
  }
  return [];
}

function getLanternPositions(night: Night): readonly (readonly number[])[] {
  if (night === 2) return NIGHT2_LANTERN_POSITIONS;
  if (night === 3) return NIGHT3_LANTERN_POSITIONS;
  return LANTERN_POSITIONS;
}

function getNightDuration(night: Night): number {
  if (night === 2) return TUNING.night2_duration_s;
  if (night === 3) return TUNING.night3_duration_s;
  return TUNING.night1_duration_s;
}

function firstShadeSpawnTick(night: Night): number {
  if (night === 2) return 7 * TICK_RATE;
  if (night === 3) return 6 * TICK_RATE;
  return 5 * TICK_RATE;
}

function shadeSpawnInterval(night: Night): number {
  if (night === 2) return 7 * TICK_RATE;
  if (night === 3) return 6 * TICK_RATE;
  return 8 * TICK_RATE;
}

function getNightStartPos(night: Night): Vec3 {
  return night === 3 ? [0, 6, 5] : [0, 0, 0];
}

export function getFloorHeight(night: Night, x: number, z: number): number | undefined {
  if (night === 1) {
    return Math.hypot(x, z) <= ISLAND_RADIUS ? 0 : undefined;
  }
  if (night === 2) {
    const onIslandA = Math.hypot(x, z) <= 28;
    const onIslandB = Math.hypot(x - 70, z) <= 28;
    const onBridge = x >= 26 && x <= 44 && z >= -2 && z <= 2;
    return onIslandA || onIslandB || onBridge ? 0 : undefined;
  }

  const radius = Math.hypot(x, z);
  if (radius > 45) return undefined;
  let height = 0;
  if (radius <= 8) height = 6;
  else if (radius >= 12 && radius <= 24 && z > 0) height = 3;
  for (const degrees of [30, 150]) {
    const radians = (degrees * Math.PI) / 180;
    const along = x * Math.cos(radians) + z * Math.sin(radians);
    const across = Math.abs(-x * Math.sin(radians) + z * Math.cos(radians));
    if (along >= 24 && along <= 30 && across <= 1.5) {
      height = Math.max(height, 3 * ((30 - along) / 6));
    }
  }
  return height;
}

function nextRandomValue(game: Pick<GameState, "rngState">): number {
  const result = nextRandom(game.rngState);
  game.rngState = result.state;
  return result.value;
}

function scenarioMotes(entries: NonNullable<Scenario["motes"]>): Mote[] {
  return entries.map((entry, index) => {
    if (Array.isArray(entry)) {
      return {
        id: `M${index + 1}`,
        pos: clonePos(entry as Vec3),
        kind: "random",
        availableFromTick: 0,
      };
    }
    return {
      id: entry.id ?? `M${index + 1}`,
      pos: clonePos(entry.pos),
      kind: entry.kind ?? "random",
      ttlTicksLeft: entry.ttl_ticks,
      availableFromTick: 0,
    };
  });
}

function scenarioShades(entries: NonNullable<Scenario["shades"]>): Shade[] {
  return entries.map((entry, index) => ({
    id: entry.id ?? `S${index + 1}`,
    pos: clonePos(entry.pos),
    state: entry.state ?? "chase",
    stateTicksLeft: entry.state_ticks_left ?? 0,
    recoilDirection: [0, 0],
    pulsePushDirection: [1, 0],
    pulsePushTicksLeft: 0,
    pulsePushRemaining: 0,
    safePushTicksLeft: 0,
    targetLanternId: entry.target_lantern_id,
    drainTicks: 0,
  }));
}

function scenarioDrifters(entries: NonNullable<Scenario["drifters"]>): Drifter[] {
  return entries.map((entry, index) => ({
    id: entry.id ?? `D${index + 1}`,
    pos: clonePos(entry.pos),
    state: entry.state ?? "idle",
    stolen: entry.stolen ?? 0,
    stateTicksLeft: entry.state_ticks_left ?? 0,
    direction: [1, 0],
  }));
}

function scenarioCharms(entries: NonNullable<Scenario["charms"]>): Charm[] {
  return entries.map((entry, index) => ({
    id: entry.id ?? `C${index + 1}`,
    pos: clonePos(entry.pos),
    available: entry.available ?? true,
    respawnTicksLeft: entry.respawn_ticks ?? 0,
  }));
}

function createDefaultMotes(seedState: number, spawnPoints: Vec3[]): { motes: Mote[]; rngState: number } {
  const points = spawnPoints.map(clonePos);
  let rngState = seedState;
  for (let index = points.length - 1; index > 0; index -= 1) {
    const result = nextRandom(rngState);
    rngState = result.state;
    const target = Math.floor(result.value * (index + 1));
    [points[index], points[target]] = [points[target], points[index]];
  }
  return {
    motes: points.slice(0, INITIAL_MOTE_COUNT).map((pos, index) => ({
      id: `M${index + 1}`,
      pos,
      kind: "random",
      availableFromTick: 0,
    })),
    rngState,
  };
}

export function createGame(seed: number, scenario?: Scenario, night: Night = 1): GameState {
  const normalizedSeed = seed >>> 0;
  const spawnPos = getNightStartPos(night);
  const moteSpawnPoints = getMoteSpawnPoints(night);
  let rngState = normalizedSeed;
  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;
  const randomDrifters = scenario?.random_drifters ?? night > 1;
  const windEnabled = scenario?.wind_enabled ?? night === 3;

  const generatedMotes = randomMotes
    ? createDefaultMotes(rngState, moteSpawnPoints)
    : { motes: [] as Mote[], rngState };
  rngState = generatedMotes.rngState;
  const motes = scenario?.motes === undefined ? generatedMotes.motes : scenarioMotes(scenario.motes);
  const shades = scenario?.shades === undefined ? [] : scenarioShades(scenario.shades);
  const drifters = scenario?.drifters === undefined ? [] : scenarioDrifters(scenario.drifters);
  const charms = scenario?.charms === undefined ? getDefaultCharms(night) : scenarioCharms(scenario.charms);

  const lanterns: Lantern[] = getLanternPositions(night).map((pos, index) => ({
    id: `L${index + 1}`,
    pos: [pos[0], pos[1], pos[2]],
    lit: false,
    deposited: 0,
    fuelUnits: 0,
    everLit: false,
    relitCount: 0,
  }));
  for (const patch of scenario?.lanterns ?? []) {
    const lantern = lanterns.find((candidate) => candidate.id === patch.id);
    if (!lantern) throw new Error(`Unknown lantern id: ${patch.id}`);
    if (patch.pos) lantern.pos = clonePos(patch.pos);
    const fuel = patch.fuel ?? (patch.lit || (patch.deposited ?? 0) >= TUNING.lantern_cost ? TUNING.fuel_max : 0);
    if (!Number.isFinite(fuel) || fuel < 0 || fuel > TUNING.fuel_max) {
      throw new Error(`Invalid fuel for lantern ${patch.id}`);
    }
    lantern.fuelUnits = Math.round(fuel * TICK_RATE);
    lantern.lit = patch.lit ?? (lantern.fuelUnits > 0);
    if (lantern.lit !== (lantern.fuelUnits > 0)) {
      throw new Error(`Lantern ${patch.id} must be lit exactly when it has fuel`);
    }
    lantern.deposited = patch.deposited ?? (lantern.lit ? TUNING.lantern_cost : 0);
    lantern.everLit = patch.ever_lit ?? (lantern.lit || lantern.deposited >= TUNING.lantern_cost);
    lantern.relitCount = patch.relit_count ?? 0;
  }
  for (const shade of shades) {
    if (shade.targetLanternId && !lanterns.some((lantern) => lantern.id === shade.targetLanternId)) {
      throw new Error(`Unknown target lantern id for shade ${shade.id}: ${shade.targetLanternId}`);
    }
  }

  const scenarioPlayer = scenario?.player;
  const initialPlayerPos = clonePos(scenarioPlayer?.pos ?? spawnPos);
  const initialFloor = getFloorHeight(night, initialPlayerPos[0], initialPlayerPos[2]);
  const player: Player = {
    pos: initialPlayerPos,
    vel: scenarioPlayer?.vel ? clonePos(scenarioPlayer.vel) : [0, 0, 0],
    grounded: initialFloor !== undefined && Math.abs(initialPlayerPos[1] - initialFloor) <= 0.001,
    facingYaw: 0,
    flames: scenarioPlayer?.flames ?? TUNING.flames,
    carried: scenarioPlayer?.carried ?? 0,
    successfulLights: scenarioPlayer?.successful_lights ?? 0,
    invulnTicks: scenarioPlayer?.invuln_ticks ?? 0,
    dashCooldownTicks: scenarioPlayer?.dash_cd_ticks ?? 0,
    dashTicksLeft: 0,
    dashDirection: [0, 1],
    pulseCooldownTicks: scenarioPlayer?.pulse_cd_ticks ?? 0,
    charmTicksLeft: scenarioPlayer?.charm_ticks ?? 0,
    respawnTicksLeft: 0,
    springCooldownTicks: 0,
    springFlightTicksLeft: 0,
    springVelocity: [0, 0],
  };

  const windAngle = nextRandom(rngState);
  rngState = windAngle.state;
  const nextMoteId = Math.max(1, ...motes.map((mote) => Number(mote.id.match(/^M(\d+)$/)?.[1] ?? 0) + 1));
  const nextShadeId = Math.max(1, ...shades.map((shade) => Number(shade.id.match(/^S(\d+)$/)?.[1] ?? 0) + 1));
  const nextDrifterId = Math.max(1, ...drifters.map((drifter) => Number(drifter.id.match(/^D(\d+)$/)?.[1] ?? 0) + 1));
  const timeLeftTicks = scenario?.time_left_s === undefined
    ? getNightDuration(night) * TICK_RATE
    : Math.round(scenario.time_left_s * TICK_RATE);
  const startTick = firstShadeSpawnTick(night);

  return {
    tick: 0,
    simTick: 0,
    night,
    status: "playing",
    timeLeftTicks,
    score: 0,
    player,
    lanterns,
    motes,
    shades,
    drifters,
    charms,
    wind: {
      active: false,
      dirDeg: windAngle.value * 360,
      activeTicksLeft: 0,
      nextGustTick: WIND_PERIOD_TICKS,
    },
    spawnPos,
    moteSpawnPoints,
    shadeSpawnPoints: getShadeSpawnPoints(night),
    nextMoteSpawnTick: 4 * TICK_RATE,
    nextShadeSpawnTick: startTick,
    nextDrifterSpawnTick: night > 1 ? 20 * TICK_RATE : Number.MAX_SAFE_INTEGER,
    randomMotes,
    randomShades,
    randomDrifters,
    windEnabled,
    rngState,
    nextMoteId,
    nextShadeId,
    nextDrifterId,
    pendingEvents: [{ type: "event", tick: 0, name: "night_start", data: { night } }],
    previousInput: {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
      pause: false,
    },
  };
}

function emit(events: GameEvent[], game: GameState, name: string, data: Record<string, unknown> = {}): void {
  events.push({ type: "event", tick: game.tick, name, data });
}

function finish(game: GameState, events: GameEvent[], status: "won" | "lost", reason: GameState["reason"]): void {
  if (game.status !== "playing") return;
  game.status = status;
  game.reason = reason;
  if (status === "won") {
    game.score += game.player.flames * TUNING.score.per_flame_left;
    for (const lantern of game.lanterns) {
      if (lantern.lit) {
        game.score += TUNING.score.per_dawn_lantern + Math.floor(lantern.fuelUnits / TICK_RATE);
      }
    }
  }
  emit(events, game, "game_over", { result: status, reason });
}

function moveToward(current: number, target: number, maximumChange: number): number {
  if (current < target) return Math.min(target, current + maximumChange);
  return Math.max(target, current - maximumChange);
}

function springLaunch(game: GameState, pos: Vec3): SpawnPad | undefined {
  if (game.night === 2) {
    const pads = [
      { pos: [20, 0, 18] as Vec3, target: [70, 0, 0] as Vec3 },
      { pos: [50, 0, -18] as Vec3, target: [0, 0, 0] as Vec3 },
    ];
    const pad = pads.find((candidate) => horizontalDistance(pos, candidate.pos) <= 1);
    if (!pad) return undefined;
    const dx = pad.target[0] - pos[0];
    const dz = pad.target[2] - pos[2];
    const length = Math.hypot(dx, dz) || 1;
    return { pos: pad.pos, velocityY: 14, velocityXZ: [(dx / length) * 24, (dz / length) * 24] };
  }
  if (game.night === 3 && horizontalDistance(pos, [0, 3, 13]) <= 1 && Math.abs(pos[1] - 3) <= 0.1) {
    return { pos: [0, 3, 13], velocityY: 12, velocityXZ: [0, -8] };
  }
  return undefined;
}

function applyFall(game: GameState, events: GameEvent[]): void {
  if (!TUNING.fall_enabled || game.player.pos[1] >= -10 || game.player.respawnTicksLeft > 0) return;
  const lost = game.player.carried;
  game.player.flames = Math.max(0, game.player.flames - 1);
  game.player.carried = 0;
  game.player.vel = [0, 0, 0];
  game.player.dashTicksLeft = 0;
  game.player.springFlightTicksLeft = 0;
  emit(events, game, "player_hit", { by: "fall", flames: game.player.flames, lost });
  if (game.player.flames > 0) game.player.respawnTicksLeft = TICK_RATE;
}

function startDash(game: GameState, input: InputState, events: GameEvent[]): boolean {
  if (!input.dash || game.previousInput.dash || game.player.dashTicksLeft > 0) return false;
  const charmActive = game.player.charmTicksLeft > 0;
  if (!charmActive && game.player.dashCooldownTicks > 0) return false;
  let directionX = 0;
  let directionZ = 0;
  const yaw = (input.cam_yaw_deg * Math.PI) / 180;
  const moveX = input.move[0];
  const moveZ = input.move[1];
  directionX = moveX * Math.cos(yaw) + moveZ * Math.sin(yaw);
  directionZ = -moveX * Math.sin(yaw) + moveZ * Math.cos(yaw);
  const length = Math.hypot(directionX, directionZ);
  if (length > 0) {
    directionX /= length;
    directionZ /= length;
  } else {
    directionX = Math.sin(game.player.facingYaw);
    directionZ = Math.cos(game.player.facingYaw);
  }
  game.player.dashDirection = [directionX, directionZ];
  game.player.dashTicksLeft = Math.round(TUNING.dash_duration_s * TICK_RATE);
  if (!charmActive) game.player.dashCooldownTicks = Math.round(TUNING.dash_cooldown_s * TICK_RATE);
  emit(events, game, "dash");
  return true;
}

function movePlayer(game: GameState, input: InputState, events: GameEvent[]): void {
  const player = game.player;
  if (player.respawnTicksLeft > 0) {
    player.respawnTicksLeft -= 1;
    if (player.respawnTicksLeft === 0) {
      player.pos = clonePos(game.spawnPos);
      player.vel = [0, 0, 0];
      player.grounded = true;
      player.invulnTicks = Math.round(TUNING.invuln_s * TICK_RATE);
      player.dashCooldownTicks = 0;
      player.pulseCooldownTicks = 0;
      player.charmTicksLeft = 0;
    }
    return;
  }

  const justDashed = startDash(game, input, events);
  const currentFloor = getFloorHeight(game.night, player.pos[0], player.pos[2]);
  player.grounded = currentFloor !== undefined &&
    Math.abs(player.pos[1] - currentFloor) <= 0.001 &&
    player.vel[1] <= 0;
  if (player.grounded && currentFloor !== undefined) {
    player.pos[1] = currentFloor;
    player.vel[1] = 0;
  }

  if (input.jump && !game.previousInput.jump && player.grounded) {
    player.vel[1] = 7;
    player.grounded = false;
    emit(events, game, "jump");
  }

  const moveMagnitude = Math.hypot(input.move[0], input.move[1]);
  const yaw = (input.cam_yaw_deg * Math.PI) / 180;
  let targetX = input.move[0] * Math.cos(yaw) + input.move[1] * Math.sin(yaw);
  let targetZ = -input.move[0] * Math.sin(yaw) + input.move[1] * Math.cos(yaw);
  const targetLength = Math.hypot(targetX, targetZ);
  if (targetLength > 1) {
    targetX /= targetLength;
    targetZ /= targetLength;
  }
  if (moveMagnitude > 0) player.facingYaw = Math.atan2(targetX, targetZ);

  const dashActive = player.dashTicksLeft > 0;
  if (dashActive) {
    player.vel[0] = player.dashDirection[0] * TUNING.dash_speed;
    player.vel[2] = player.dashDirection[1] * TUNING.dash_speed;
    if (!player.grounded) player.vel[1] = 0;
    player.dashTicksLeft -= 1;
  } else if (player.springFlightTicksLeft > 0) {
    player.vel[0] = player.springVelocity[0];
    player.vel[2] = player.springVelocity[1];
  } else {
    const speed = TUNING.player_speed * (player.charmTicksLeft > 0 ? 1.2 : 1);
    let desiredX = targetX * speed;
    let desiredZ = targetZ * speed;
    if (game.wind.active) {
      const direction = (game.wind.dirDeg * Math.PI) / 180;
      desiredX += Math.cos(direction) * 2;
      desiredZ += Math.sin(direction) * 2;
    }
    const acceleration = player.grounded ? 1 : 0.15;
    player.vel[0] = moveToward(player.vel[0], desiredX, acceleration);
    player.vel[2] = moveToward(player.vel[2], desiredZ, acceleration);
  }

  const wasGrounded = player.grounded;
  const previousX = player.pos[0];
  const previousZ = player.pos[2];
  player.pos[0] += player.vel[0] / TICK_RATE;
  player.pos[2] += player.vel[2] / TICK_RATE;
  if (
    game.night === 3 &&
    player.pos[1] >= 5.99 &&
    player.pos[1] <= 14 &&
    Math.hypot(player.pos[0], player.pos[2]) < 2.2
  ) {
    player.pos[0] = previousX;
    player.pos[2] = previousZ;
    player.vel[0] = 0;
    player.vel[2] = 0;
  }
  const previousY = player.pos[1];
  if (dashActive && !wasGrounded) {
    player.springFlightTicksLeft = Math.max(0, player.springFlightTicksLeft - 1);
  } else {
    if (!player.grounded) player.vel[1] -= 20 / TICK_RATE;
    player.pos[1] += player.vel[1] / TICK_RATE;
    if (player.springFlightTicksLeft > 0) {
      player.springFlightTicksLeft -= 1;
      if (player.springFlightTicksLeft === 0) player.springVelocity = [0, 0];
    }
  }

  const floor = getFloorHeight(game.night, player.pos[0], player.pos[2]);
  if (floor !== undefined && previousY >= floor - 0.001 && player.pos[1] <= floor && player.vel[1] <= 0) {
    player.pos[1] = floor;
    player.vel[1] = 0;
    player.grounded = true;
    player.springFlightTicksLeft = 0;
    player.springVelocity = [0, 0];
  } else {
    player.grounded = false;
  }

  if (player.grounded && player.springCooldownTicks === 0) {
    const launch = springLaunch(game, player.pos);
    if (launch) {
      player.springVelocity = launch.velocityXZ;
      player.vel[0] = player.springVelocity[0];
      player.vel[1] = launch.velocityY;
      player.vel[2] = player.springVelocity[1];
      player.grounded = false;
      player.springFlightTicksLeft = Math.round(1.4 * TICK_RATE);
      player.springCooldownTicks = 90;
      emit(events, game, "spring_launched");
    }
  }

  if (justDashed && !wasGrounded) player.grounded = false;
  applyFall(game, events);
}

function pickUpMotes(game: GameState, events: GameEvent[]): void {
  const player = game.player;
  if (player.respawnTicksLeft > 0) return;
  for (let index = game.motes.length - 1; index >= 0; index -= 1) {
    if (player.carried >= getPlayerCapacity(game)) break;
    const mote = game.motes[index];
    if (game.simTick < mote.availableFromTick) continue;
    if (horizontalDistance(player.pos, mote.pos) > TUNING.pickup_radius) continue;
    if (Math.abs(player.pos[1] - mote.pos[1]) > 1.5) continue;
    game.motes.splice(index, 1);
    player.carried += 1;
    game.score += TUNING.score.per_mote;
    emit(events, game, "mote_picked", { mote_id: mote.id, carried: player.carried });
  }
}

function pickUpCharms(game: GameState, events: GameEvent[]): void {
  const player = game.player;
  if (player.respawnTicksLeft > 0) return;
  for (const charm of game.charms) {
    if (!charm.available || horizontalDistance(player.pos, charm.pos) > TUNING.pickup_radius) continue;
    if (Math.abs(player.pos[1] - charm.pos[1]) > 1.5) continue;
    charm.available = false;
    charm.respawnTicksLeft = 45 * TICK_RATE;
    player.charmTicksLeft = 10 * TICK_RATE;
    emit(events, game, "charm_picked", { charm_id: charm.id, charm_ticks: player.charmTicksLeft });
  }
}

function interactWithLantern(game: GameState, events: GameEvent[]): string | undefined {
  if (game.player.carried <= 0) return undefined;
  const lantern = getNearestReceivableLantern(game);
  if (!lantern || !isWithinLanternRange(game.player.pos, lantern)) return undefined;

  if (lantern.lit) {
    const fuelMissing = TUNING.fuel_max * TICK_RATE - lantern.fuelUnits;
    const used = Math.min(
      game.player.carried,
      Math.ceil(fuelMissing / (TUNING.fuel_per_mote * TICK_RATE)),
    );
    if (used <= 0) return undefined;
    lantern.fuelUnits = Math.min(
      TUNING.fuel_max * TICK_RATE,
      lantern.fuelUnits + used * TUNING.fuel_per_mote * TICK_RATE,
    );
    game.player.carried -= used;
    game.score += used * TUNING.score.per_mote;
    emit(events, game, "refuel", {
      lantern_id: lantern.id,
      amount: used,
      fuel: Number((lantern.fuelUnits / TICK_RATE).toFixed(1)),
    });
    return undefined;
  }

  const relight = lantern.everLit;
  const cost = relight ? TUNING.relight_cost : TUNING.lantern_cost;
  const amount = Math.min(game.player.carried, cost - lantern.deposited);
  if (amount <= 0) return undefined;
  game.player.carried -= amount;
  lantern.deposited += amount;
  game.score += amount * TUNING.score.per_mote;
  emit(events, game, "deposit", { lantern_id: lantern.id, amount, deposited: lantern.deposited });
  if (lantern.deposited >= cost) {
    lantern.lit = true;
    lantern.fuelUnits = TUNING.fuel_max * TICK_RATE;
    lantern.everLit = true;
    game.player.successfulLights += 1;
    if (relight) {
      lantern.relitCount += 1;
      game.score += TUNING.score.per_relight;
    } else {
      game.score += TUNING.score.per_lantern;
    }
    emit(events, game, "lantern_lit", { lantern_id: lantern.id, relight });
    return lantern.id;
  }
  return undefined;
}

function lanternIsSafe(lantern: Lantern): boolean {
  return lantern.lit && lantern.fuelUnits >= TUNING.low_fuel_threshold * TICK_RATE;
}

function turnLanternOut(lantern: Lantern, events: GameEvent[], game: GameState): void {
  if (!lantern.lit) return;
  lantern.lit = false;
  lantern.fuelUnits = 0;
  lantern.deposited = 0;
  emit(events, game, "lantern_out", { lantern_id: lantern.id });
}

function decayLanternFuel(game: GameState, events: GameEvent[]): void {
  const decay = Math.round(TUNING.fuel_decay_per_s);
  for (const lantern of game.lanterns) {
    if (!lantern.lit) continue;
    lantern.fuelUnits = Math.max(0, lantern.fuelUnits - decay);
    if (lantern.fuelUnits === 0) turnLanternOut(lantern, events, game);
  }
}

function safePushTarget(shade: Shade, lantern: Lantern): Vec3 {
  let dx = shade.pos[0] - lantern.pos[0];
  let dz = shade.pos[2] - lantern.pos[2];
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    dx = 1;
    dz = 0;
  } else {
    dx /= length;
    dz /= length;
  }
  return [
    lantern.pos[0] + dx * (TUNING.safe_radius + 0.1),
    shade.pos[1],
    lantern.pos[2] + dz * (TUNING.safe_radius + 0.1),
  ];
}

function updateSafeZones(game: GameState, newlySafe: string[]): void {
  if (newlySafe.length === 0) return;
  const lanterns = game.lanterns.filter((lantern) => newlySafe.includes(lantern.id));
  for (const shade of game.shades) {
    const lantern = lanterns.find(
      (candidate) => horizontalDistance(shade.pos, candidate.pos) <= TUNING.safe_radius,
    );
    if (!lantern) continue;
    shade.state = "wander";
    shade.targetLanternId = undefined;
    shade.drainTicks = 0;
    shade.safePushTarget = safePushTarget(shade, lantern);
    shade.safePushTicksLeft = 30;
  }
}

function isInLitSafeZone(game: GameState, pos: Vec3): boolean {
  return game.lanterns.some(
    (lantern) => lanternIsSafe(lantern) && horizontalDistance(pos, lantern.pos) <= TUNING.safe_radius,
  );
}

function pulse(game: GameState, events: GameEvent[]): void {
  game.player.carried -= TUNING.pulse_cost;
  game.player.pulseCooldownTicks = Math.round(TUNING.pulse_cooldown_s * TICK_RATE);
  const center: Vec3 = [game.player.pos[0], game.player.pos[1] + 0.8, game.player.pos[2]];
  const stunnedIds: string[] = [];
  for (const shade of game.shades) {
    if (distance3d(center, shade.pos) > TUNING.pulse_radius) continue;
    const stunScore = shade.state === "drain" ? TUNING.score.per_stun_draining : TUNING.score.per_stun;
    let dx = shade.pos[0] - center[0];
    let dz = shade.pos[2] - center[2];
    const length = Math.hypot(dx, dz);
    if (length === 0) {
      dx = 1;
      dz = 0;
    } else {
      dx /= length;
      dz /= length;
    }
    shade.state = "stunned";
    shade.stateTicksLeft = Math.round(TUNING.pulse_stun_s * TICK_RATE);
    shade.pulsePushDirection = [dx, dz];
    shade.pulsePushTicksLeft = 15;
    shade.pulsePushRemaining = TUNING.pulse_push_m;
    stunnedIds.push(shade.id);
    game.score += stunScore;
    shade.targetLanternId = undefined;
    shade.drainTicks = 0;
  }
  for (const drifter of game.drifters) {
    if (drifter.state === "chase" && horizontalDistance(center, drifter.pos) <= TUNING.pulse_radius) {
      const dx = drifter.pos[0] - center[0];
      const dz = drifter.pos[2] - center[2];
      const length = Math.hypot(dx, dz) || 1;
      drifter.direction = length === 1 && dx === 0 && dz === 0 ? [1, 0] : [dx / length, dz / length];
      drifter.state = "flee";
      drifter.stateTicksLeft = 4 * TICK_RATE;
    } else if (drifter.state === "flee" && drifter.stolen > 0 && horizontalDistance(center, drifter.pos) <= TUNING.pulse_radius) {
      const amount = drifter.stolen;
      game.motes.push({
        id: `M${game.nextMoteId++}`,
        pos: clonePos(drifter.pos),
        kind: "dropped",
        ttlTicksLeft: 8 * TICK_RATE,
        availableFromTick: game.simTick + 1,
      });
      drifter.stolen = 0;
      drifter.stateTicksLeft = 2 * TICK_RATE;
      emit(events, game, "drifter_drop", { drifter_id: drifter.id, amount });
    }
  }
  emit(events, game, "pulse", { stunned_ids: stunnedIds });
}

function moveShade(game: GameState, shade: Shade, dx: number, dz: number, distance: number): void {
  if (distance <= 0) return;
  const length = Math.hypot(dx, dz) || 1;
  const step = Math.min(distance, Math.hypot(dx, dz));
  const x = shade.pos[0] + (dx / length) * step;
  const z = shade.pos[2] + (dz / length) * step;
  const floor = getFloorHeight(game.night, x, z);
  const proposed: Vec3 = [x, floor === undefined ? shade.pos[1] : floor + 1, z];
  if (floor === undefined || isInLitSafeZone(game, proposed)) return;
  shade.pos = proposed;
}

function nearestLanternByDistance(shade: Shade, lanterns: Lantern[]): Lantern | undefined {
  return lanterns
    .slice()
    .sort((a, b) => {
      const distance = horizontalDistance(shade.pos, a.pos) - horizontalDistance(shade.pos, b.pos);
      return distance !== 0 ? distance : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0];
}

function shadeLanternTarget(game: GameState, shade: Shade): Lantern | undefined {
  const weak = nearestLanternByDistance(
    shade,
    game.lanterns.filter(
      (lantern) => lantern.lit && lantern.fuelUnits < TUNING.low_fuel_threshold * TICK_RATE,
    ),
  );
  return weak ?? nearestLanternByDistance(shade, game.lanterns.filter((lantern) => !lantern.lit));
}

function drainLantern(game: GameState, shade: Shade, lantern: Lantern, events: GameEvent[]): void {
  lantern.fuelUnits = Math.max(0, lantern.fuelUnits - Math.round(TUNING.drain_per_s));
  shade.drainTicks += 1;
  if (shade.drainTicks % TICK_RATE === 0) {
    emit(events, game, "fuel_drain", {
      lantern_id: lantern.id,
      shade_id: shade.id,
      fuel: Number((lantern.fuelUnits / TICK_RATE).toFixed(1)),
    });
  }
  if (lantern.fuelUnits === 0) {
    turnLanternOut(lantern, events, game);
    shade.state = "wander";
    shade.targetLanternId = undefined;
    shade.drainTicks = 0;
  }
}

function moveShades(game: GameState, events: GameEvent[]): void {
  const speed = game.night === 3 ? 4.5 : TUNING.shade_speed;
  for (const shade of game.shades) {
    if (shade.safePushTarget && shade.safePushTicksLeft > 0) {
      const remainingTicks = shade.safePushTicksLeft;
      shade.pos[0] += (shade.safePushTarget[0] - shade.pos[0]) / remainingTicks;
      shade.pos[2] += (shade.safePushTarget[2] - shade.pos[2]) / remainingTicks;
      shade.safePushTicksLeft -= 1;
      if (shade.safePushTicksLeft === 0) {
        shade.pos = clonePos(shade.safePushTarget);
        shade.safePushTarget = undefined;
      }
      continue;
    }
    if (shade.state === "spawning") {
      shade.stateTicksLeft -= 1;
      if (shade.stateTicksLeft <= 0) {
        shade.state = "wander";
        shade.stateTicksLeft = 0;
      }
      continue;
    }
    if (shade.state === "stunned") {
      if (shade.pulsePushTicksLeft > 0 && shade.pulsePushRemaining > 0) {
        const distance = Math.min(shade.pulsePushRemaining, TUNING.pulse_push_m / 15);
        const previous = clonePos(shade.pos);
        moveShade(game, shade, shade.pulsePushDirection[0], shade.pulsePushDirection[1], distance);
        if (shade.pos[0] === previous[0] && shade.pos[2] === previous[2]) {
          shade.pulsePushRemaining = 0;
          shade.pulsePushTicksLeft = 0;
        } else {
          shade.pulsePushRemaining = Math.max(0, shade.pulsePushRemaining - distance);
          shade.pulsePushTicksLeft -= 1;
        }
      }
      shade.stateTicksLeft -= 1;
      if (shade.stateTicksLeft <= 0) {
        shade.state = "wander";
        shade.stateTicksLeft = 0;
        shade.targetLanternId = undefined;
        shade.drainTicks = 0;
      }
      continue;
    }
    if (shade.state === "recoil") {
      if (shade.stateTicksLeft > 0) {
        moveShade(game, shade, shade.recoilDirection[0], shade.recoilDirection[1], 2 / TICK_RATE);
        shade.stateTicksLeft -= 1;
        continue;
      }
      shade.state = horizontalDistance(shade.pos, game.player.pos) <= 18 ? "chase" : "wander";
    }

    const playerDistance = horizontalDistance(shade.pos, game.player.pos);
    if (shade.state === "drain") {
      const lantern = game.lanterns.find((candidate) => candidate.id === shade.targetLanternId);
      if (
        !lantern ||
        !lantern.lit ||
        lantern.fuelUnits >= TUNING.low_fuel_threshold * TICK_RATE ||
        horizontalDistance(shade.pos, lantern.pos) > 2
      ) {
        shade.state = "wander";
        shade.targetLanternId = undefined;
        shade.drainTicks = 0;
        continue;
      }
      if (playerDistance <= 6) {
        shade.state = "chase";
        shade.drainTicks = 0;
        continue;
      }
      drainLantern(game, shade, lantern, events);
      continue;
    }

    if (shade.state === "chase" && playerDistance > 18) {
      shade.state = "wander";
      shade.targetLanternId = undefined;
    } else if (shade.state === "wander" && playerDistance <= 12) {
      shade.state = "chase";
    }
    if (shade.state === "chase") {
      moveShade(
        game,
        shade,
        game.player.pos[0] - shade.pos[0],
        game.player.pos[2] - shade.pos[2],
        speed / TICK_RATE,
      );
      continue;
    }

    const target = shadeLanternTarget(game, shade);
    shade.targetLanternId = target?.id;
    if (target) {
      const dx = target.pos[0] - shade.pos[0];
      const dz = target.pos[2] - shade.pos[2];
      if (
        target.lit &&
        target.fuelUnits < TUNING.low_fuel_threshold * TICK_RATE &&
        horizontalDistance(shade.pos, target.pos) <= 2
      ) {
        shade.state = "drain";
        shade.drainTicks = 0;
        drainLantern(game, shade, target, events);
      } else {
        moveShade(game, shade, dx, dz, 1.2 / TICK_RATE);
      }
      continue;
    }
    if (playerDistance < 1) {
      const angle = nextRandomValue(game) * Math.PI * 2;
      shade.recoilDirection = [Math.cos(angle), Math.sin(angle)];
    }
    moveShade(game, shade, shade.recoilDirection[0], shade.recoilDirection[1], 1.2 / TICK_RATE);
  }
}

function dropMotes(game: GameState, amount: number): void {
  for (let index = 0; index < amount; index += 1) {
    const angle = nextRandomValue(game) * Math.PI * 2;
    const radius = 1.5 + nextRandomValue(game);
    let x = game.player.pos[0] + Math.cos(angle) * radius;
    let z = game.player.pos[2] + Math.sin(angle) * radius;
    const floor = getFloorHeight(game.night, x, z);
    if (floor === undefined) {
      x = game.player.pos[0];
      z = game.player.pos[2];
    }
    game.motes.push({
      id: `M${game.nextMoteId++}`,
      pos: [x, game.player.pos[1], z],
      kind: "dropped",
      ttlTicksLeft: 8 * TICK_RATE,
      availableFromTick: game.simTick + 1,
    });
  }
}

function moveDrifters(game: GameState, events: GameEvent[]): void {
  for (const drifter of game.drifters) {
    if (drifter.state === "removed") continue;
    if (drifter.state === "flee") {
      if (drifter.stateTicksLeft <= 0) {
        drifter.state = "removed";
        continue;
      }
      const speed = drifter.stolen > 0 ? 7 : 7;
      drifter.pos[0] += (drifter.direction[0] * speed) / TICK_RATE;
      drifter.pos[2] += (drifter.direction[1] * speed) / TICK_RATE;
      drifter.stateTicksLeft -= 1;
      continue;
    }

    const distance = horizontalDistance(game.player.pos, drifter.pos);
    if (drifter.state === "idle") {
      if (game.player.carried < 5 || distance > 15) {
        const angle = nextRandomValue(game) * Math.PI * 2;
        drifter.pos[0] += (Math.cos(angle) * 2) / TICK_RATE;
        drifter.pos[2] += (Math.sin(angle) * 2) / TICK_RATE;
        continue;
      }
      drifter.state = "chase";
    }
    if (drifter.state === "chase") {
      if (game.player.carried < 5 || distance > 15) {
        drifter.state = "idle";
        continue;
      }
      const dx = game.player.pos[0] - drifter.pos[0];
      const dz = game.player.pos[2] - drifter.pos[2];
      const length = Math.hypot(dx, dz) || 1;
      drifter.pos[0] += (dx / length) * (7 / TICK_RATE);
      drifter.pos[2] += (dz / length) * (7 / TICK_RATE);
      if (horizontalDistance(game.player.pos, drifter.pos) <= 1.2) {
        const amount = Math.min(3, game.player.carried);
        game.player.carried -= amount;
        drifter.stolen = amount;
        drifter.direction = [-dx / length, -dz / length];
        drifter.state = "flee";
        drifter.stateTicksLeft = 4 * TICK_RATE;
        emit(events, game, "drifter_steal", {
          drifter_id: drifter.id,
          amount,
          carried: game.player.carried,
        });
      }
    }
  }
  game.drifters = game.drifters.filter((drifter) => drifter.state !== "removed");
}

function applyShadeHit(game: GameState, shade: Shade, events: GameEvent[]): void {
  game.player.flames = Math.max(0, game.player.flames - 1);
  game.player.invulnTicks = Math.round(TUNING.invuln_s * TICK_RATE);
  const dropped = Math.floor(game.player.carried * TUNING.hit_drop_ratio);
  game.player.carried -= dropped;
  dropMotes(game, dropped);
  const dx = shade.pos[0] - game.player.pos[0];
  const dz = shade.pos[2] - game.player.pos[2];
  const length = Math.hypot(dx, dz) || 1;
  shade.recoilDirection = length === 1 && dx === 0 && dz === 0 ? [1, 0] : [dx / length, dz / length];
  shade.state = "recoil";
  shade.stateTicksLeft = TICK_RATE;
  emit(events, game, "player_hit", { by: "shade", flames: game.player.flames, dropped });
}

function applyShadeHits(game: GameState, events: GameEvent[]): void {
  if (game.player.invulnTicks > 0 || game.player.respawnTicksLeft > 0) return;
  for (const shade of [...game.shades].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (shade.state === "spawning" || shade.state === "stunned" || shade.safePushTicksLeft > 0) continue;
    if (horizontalDistance(game.player.pos, shade.pos) > TUNING.shade_hit_radius) continue;
    if (Math.abs(game.player.pos[1] - shade.pos[1]) > 1.5) continue;
    applyShadeHit(game, shade, events);
    return;
  }
}

function spawnMotes(game: GameState): void {
  if (!game.randomMotes) return;
  while (game.simTick >= game.nextMoteSpawnTick) {
    if (game.motes.length < MAX_MOTES) {
      const emptyPoints = game.moteSpawnPoints.filter(
        (point) => !game.motes.some((mote) => horizontalDistance(mote.pos, point) < 0.1),
      );
      if (emptyPoints.length > 0) {
        const index = Math.floor(nextRandomValue(game) * emptyPoints.length);
        game.motes.push({
          id: `M${game.nextMoteId++}`,
          pos: clonePos(emptyPoints[index]),
          kind: "random",
          availableFromTick: game.simTick + 1,
        });
      }
    }
    game.nextMoteSpawnTick += 4 * TICK_RATE;
  }
}

function spawnShades(game: GameState, events: GameEvent[]): void {
  if (!game.randomShades || game.shades.length >= MAX_SHADES[game.night]) return;
  while (game.simTick >= game.nextShadeSpawnTick) {
    const firstSpawn = game.nextShadeSpawnTick === firstShadeSpawnTick(game.night);
    const count = game.night === 1 && firstSpawn ? 2 : 1;
    for (let index = 0; index < count && game.shades.length < MAX_SHADES[game.night]; index += 1) {
      const candidates = game.shadeSpawnPoints.filter(
        (point) => horizontalDistance(game.player.pos, point) >= 15,
      );
      if (candidates.length === 0) break;
      const spawn = clonePos(candidates[Math.floor(nextRandomValue(game) * candidates.length)]);
      const shade: Shade = {
        id: `S${game.nextShadeId++}`,
        pos: spawn,
        state: "spawning",
        stateTicksLeft: 30,
        recoilDirection: [1, 0],
        pulsePushDirection: [1, 0],
        pulsePushTicksLeft: 0,
        pulsePushRemaining: 0,
        safePushTicksLeft: 0,
        drainTicks: 0,
      };
      game.shades.push(shade);
      emit(events, game, "shade_spawned", { id: shade.id });
    }
    game.nextShadeSpawnTick += shadeSpawnInterval(game.night);
    if (game.shades.length >= MAX_SHADES[game.night]) break;
  }
}

function spawnDrifter(game: GameState, events: GameEvent[]): void {
  if (!game.randomDrifters || game.night === 1 || game.drifters.length >= MAX_DRIFTERS) return;
  while (game.simTick >= game.nextDrifterSpawnTick) {
    if (game.drifters.length < MAX_DRIFTERS && game.moteSpawnPoints.length > 0) {
      const pos = clonePos(game.moteSpawnPoints[Math.floor(nextRandomValue(game) * game.moteSpawnPoints.length)]);
      const drifter: Drifter = {
        id: `D${game.nextDrifterId++}`,
        pos: [pos[0], pos[1] + 1, pos[2]],
        state: "idle",
        stolen: 0,
        stateTicksLeft: 0,
        direction: [1, 0],
      };
      game.drifters.push(drifter);
      emit(events, game, "drifter_spawned", { id: drifter.id });
    }
    game.nextDrifterSpawnTick += 20 * TICK_RATE;
    if (game.drifters.length >= MAX_DRIFTERS) break;
  }
}

function updateWind(game: GameState): void {
  if (!game.windEnabled) {
    game.wind.active = false;
    game.wind.activeTicksLeft = 0;
    return;
  }
  if (game.simTick >= game.wind.nextGustTick + WIND_DURATION_TICKS) {
    game.wind.nextGustTick += WIND_PERIOD_TICKS;
    game.wind.dirDeg = nextRandomValue(game) * 360;
  }
  const active = game.simTick >= game.wind.nextGustTick;
  game.wind.active = active;
  game.wind.activeTicksLeft = active
    ? game.wind.nextGustTick + WIND_DURATION_TICKS - game.simTick
    : 0;
}

function decrementCounters(game: GameState): void {
  game.timeLeftTicks = Math.max(0, game.timeLeftTicks - 1);
  if (game.player.invulnTicks > 0) game.player.invulnTicks -= 1;
  if (game.player.dashCooldownTicks > 0) game.player.dashCooldownTicks -= 1;
  if (game.player.pulseCooldownTicks > 0) game.player.pulseCooldownTicks -= 1;
  if (game.player.charmTicksLeft > 0) game.player.charmTicksLeft -= 1;
  if (game.player.springCooldownTicks > 0) game.player.springCooldownTicks -= 1;
  for (const mote of game.motes) {
    if (mote.ttlTicksLeft !== undefined) mote.ttlTicksLeft -= 1;
  }
  game.motes = game.motes.filter((mote) => mote.ttlTicksLeft === undefined || mote.ttlTicksLeft > 0);
  for (const charm of game.charms) {
    if (!charm.available && charm.respawnTicksLeft > 0) {
      charm.respawnTicksLeft -= 1;
      if (charm.respawnTicksLeft === 0) charm.available = true;
    }
  }
}

export function stepGame(game: GameState, input: InputState): GameEvent[] {
  const events = game.pendingEvents.splice(0);
  if (game.status === "won" || game.status === "lost") return events;
  game.tick += 1;
  const pausePressed = input.pause && !game.previousInput.pause;
  if (game.status === "paused") {
    if (pausePressed) {
      game.status = "playing";
      emit(events, game, "resumed");
    } else {
      game.previousInput = cloneInput(input);
      return events;
    }
  } else if (pausePressed) {
    game.status = "paused";
    emit(events, game, "paused");
    game.previousInput = cloneInput(input);
    return events;
  }

  game.simTick += 1;
  decrementCounters(game);
  updateWind(game);
  movePlayer(game, input, events);
  pickUpMotes(game, events);
  pickUpCharms(game, events);

  const safeBeforeInteract = new Set(
    game.lanterns.filter(lanternIsSafe).map((lantern) => lantern.id),
  );
  if (input.interact && !game.previousInput.interact) {
    interactWithLantern(game, events);
  }
  const newlySafe = game.lanterns
    .filter((lantern) => lanternIsSafe(lantern) && !safeBeforeInteract.has(lantern.id))
    .map((lantern) => lantern.id);
  updateSafeZones(game, newlySafe);

  if (
    input.pulse &&
    !game.previousInput.pulse &&
    game.player.pulseCooldownTicks === 0 &&
    game.player.carried >= TUNING.pulse_cost
  ) {
    pulse(game, events);
  }

  decayLanternFuel(game, events);
  moveShades(game, events);
  moveDrifters(game, events);
  applyShadeHits(game, events);
  spawnMotes(game);
  spawnShades(game, events);
  spawnDrifter(game, events);

  game.previousInput = cloneInput(input);
  if (game.player.flames <= 0) finish(game, events, "lost", "no_flames");
  else if (game.timeLeftTicks <= 0) {
    const requiredLit = Math.ceil(TUNING.win_ratio * game.lanterns.length);
    finish(
      game,
      events,
      countLitLanterns(game) >= requiredLit ? "won" : "lost",
      countLitLanterns(game) >= requiredLit ? "dawn_survived" : "dawn",
    );
  }
  return events;
}

export function countLitLanterns(game: GameState): number {
  return game.lanterns.filter((lantern) => lantern.lit).length;
}

export function getPlayerCapacity(game: GameState): number {
  return Math.min(TUNING.capacity_max, TUNING.carry_capacity + 2 * game.player.successfulLights);
}

export function getLanternLightRatio(game: GameState): number {
  const maximum = TUNING.fuel_max * TICK_RATE;
  return game.lanterns.reduce((sum, lantern) => sum + lantern.fuelUnits / maximum, 0) / game.lanterns.length;
}

export function getNearestReceivableLantern(game: GameState): Lantern | undefined {
  return game.lanterns
    .filter((lantern) => !lantern.lit || lantern.fuelUnits < TUNING.fuel_max * TICK_RATE)
    .sort((a, b) => {
      const distance = distance3d(game.player.pos, a.pos) - distance3d(game.player.pos, b.pos);
      return distance !== 0 ? distance : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0];
}

export function isWithinLanternRange(playerPos: Vec3, lantern: Lantern): boolean {
  return distance3d(playerPos, lantern.pos) <= TUNING.interact_radius;
}

export function createDefaultInput(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}

export function getTimeLeftSeconds(game: GameState): number {
  return game.timeLeftTicks / TICK_RATE;
}

export function getNextRandomValue(game: GameState): number {
  return nextRandomValue(game);
}

export function isWindWarning(game: GameState): boolean {
  return game.windEnabled &&
    !game.wind.active &&
    game.wind.nextGustTick - game.simTick > 0 &&
    game.wind.nextGustTick - game.simTick <= 2 * TICK_RATE;
}
