import { EMPTY_INPUT, ISLAND_RADIUS, LANTERN_POSITIONS, TICK_RATE, TUNING } from "./config";
import { nextRandom, randomDiskPoint } from "./random";
import type {
  GameEvent,
  GameState,
  InputState,
  Lantern,
  Mote,
  Scenario,
  Shade,
  Vec3,
} from "./types";

const INITIAL_MOTE_COUNT = 34;
const INITIAL_SHADE_COUNT = 2;
const MAX_SHADES = 5;

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function clonePos(pos: Vec3): Vec3 {
  return [pos[0], pos[1], pos[2]];
}

function buildDefaultMotes(seedState: number): { motes: Mote[]; rngState: number; nextId: number } {
  const motes: Mote[] = [];
  let rngState = seedState;
  for (let index = 0; index < INITIAL_MOTE_COUNT; index += 1) {
    const point = randomDiskPoint(rngState, 4, ISLAND_RADIUS - 2);
    rngState = point.state;
    motes.push({ id: `M${index + 1}`, pos: point.pos });
  }
  return { motes, rngState, nextId: INITIAL_MOTE_COUNT + 1 };
}

function buildDefaultShades(seedState: number): { shades: Shade[]; rngState: number; nextId: number } {
  const shades: Shade[] = [];
  let rngState = seedState;
  for (let index = 0; index < INITIAL_SHADE_COUNT; index += 1) {
    const angleResult = nextRandom(rngState);
    const radiusResult = nextRandom(angleResult.state);
    rngState = radiusResult.state;
    const angle = Math.PI / 2 + (angleResult.value - 0.5) * Math.PI * 0.7;
    const radius = 17 + Math.sqrt(radiusResult.value) * 7;
    shades.push({
      id: `S${index + 1}`,
      pos: [Math.cos(angle) * radius, 1, Math.sin(angle) * radius],
      state: "chase",
      stunTicksLeft: 0,
    });
  }
  return { shades, rngState, nextId: INITIAL_SHADE_COUNT + 1 };
}

function scenarioMotes(entries: NonNullable<Scenario["motes"]>): Mote[] {
  return entries.map((entry, index) => {
    if (Array.isArray(entry)) {
      return { id: `M${index + 1}`, pos: clonePos(entry as Vec3) };
    }
    return {
      id: entry.id ?? `M${index + 1}`,
      pos: clonePos(entry.pos),
    };
  });
}

function scenarioShades(entries: NonNullable<Scenario["shades"]>): Shade[] {
  return entries.map((entry, index) => ({
    id: entry.id ?? `S${index + 1}`,
    pos: clonePos(entry.pos),
    state: "chase",
    stunTicksLeft: 0,
  }));
}

export function createGame(seed: number, scenario?: Scenario): GameState {
  const normalizedSeed = seed >>> 0;
  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;

  let rngState = normalizedSeed;
  const generatedMotes = randomMotes ? buildDefaultMotes(rngState) : { motes: [], rngState, nextId: 1 };
  rngState = generatedMotes.rngState;
  const generatedShades = randomShades
    ? buildDefaultShades(rngState)
    : { shades: [], rngState, nextId: 1 };
  rngState = generatedShades.rngState;

  const lanterns: Lantern[] = LANTERN_POSITIONS.slice(0, TUNING.lantern_count_night1).map(
    (pos, index) => ({
      id: `L${index + 1}`,
      pos: [pos[0], pos[1], pos[2]],
      lit: false,
      deposited: 0,
    }),
  );

  for (const patch of scenario?.lanterns ?? []) {
    const lantern = lanterns.find((candidate) => candidate.id === patch.id);
    if (!lantern) {
      throw new Error(`Unknown lantern id: ${patch.id}`);
    }
    if (patch.pos) lantern.pos = clonePos(patch.pos);
    if (patch.deposited !== undefined) lantern.deposited = patch.deposited;
    if (patch.lit !== undefined) lantern.lit = patch.lit;
    else if (lantern.deposited >= TUNING.lantern_cost) lantern.lit = true;
  }

  const playerPos = scenario?.player?.pos ?? [0, 0, 0];
  const timeLeftTicks = scenario?.time_left_s === undefined
    ? TUNING.night1_duration_s * TICK_RATE
    : Math.round(scenario.time_left_s * TICK_RATE);
  const motes = scenario?.motes === undefined
    ? generatedMotes.motes
    : scenarioMotes(scenario.motes);
  const shades = scenario?.shades === undefined
    ? generatedShades.shades
    : scenarioShades(scenario.shades);
  const nextMoteId = Math.max(
    generatedMotes.nextId,
    ...motes.map((mote) => Number(mote.id.match(/^M(\d+)$/)?.[1] ?? 0) + 1),
  );
  const nextShadeId = Math.max(
    generatedShades.nextId,
    ...shades.map((shade) => Number(shade.id.match(/^S(\d+)$/)?.[1] ?? 0) + 1),
  );

  return {
    tick: 0,
    status: "playing",
    timeLeftTicks,
    score: 0,
    player: {
      pos: clonePos(playerPos),
      flames: scenario?.player?.flames ?? TUNING.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: 0,
      jumpVelocity: 0,
    },
    lanterns,
    motes,
    shades,
    randomMotes,
    randomShades,
    rngState,
    nextMoteId,
    nextShadeId,
    nextShadeSpawnTick: 20 * TICK_RATE,
    pulseCooldownTicks: 0,
    previousInput: EMPTY_INPUT(),
  };
}

function emit(events: GameEvent[], game: GameState, name: string, data: Record<string, unknown>): void {
  events.push({ type: "event", tick: game.tick, name, data });
}

function finish(game: GameState, events: GameEvent[], status: "won" | "lost", reason: GameState["reason"]): void {
  if (game.status !== "playing") return;
  game.status = status;
  game.reason = reason;
  if (status === "won") {
    game.score += Math.floor(game.timeLeftTicks / TICK_RATE) * TUNING.score.per_second_left;
    game.score += game.player.flames * TUNING.score.per_flame_left;
  }
  emit(events, game, "game_over", { result: status, reason });
}

function movePlayer(game: GameState, input: InputState): void {
  let [x, z] = input.move;
  const magnitude = Math.hypot(x, z);
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }
  const yaw = (input.cam_yaw_deg * Math.PI) / 180;
  const worldX = x * Math.cos(yaw) + z * Math.sin(yaw);
  const worldZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const step = TUNING.player_speed / TICK_RATE;

  game.player.pos[0] += worldX * step;
  game.player.pos[2] += worldZ * step;
  const radius = Math.hypot(game.player.pos[0], game.player.pos[2]);
  if (radius > ISLAND_RADIUS - 1) {
    const scale = (ISLAND_RADIUS - 1) / radius;
    game.player.pos[0] *= scale;
    game.player.pos[2] *= scale;
  }

  if (input.jump && !game.previousInput.jump && game.player.pos[1] === 0) {
    game.player.jumpVelocity = 6;
  }
  game.player.pos[1] += game.player.jumpVelocity / TICK_RATE;
  game.player.jumpVelocity -= 18 / TICK_RATE;
  if (game.player.pos[1] < 0) {
    game.player.pos[1] = 0;
    game.player.jumpVelocity = 0;
  }
}

function pickUpMotes(game: GameState, events: GameEvent[]): void {
  for (let index = game.motes.length - 1; index >= 0; index -= 1) {
    if (game.player.carried >= TUNING.carry_capacity) break;
    const mote = game.motes[index];
    if (horizontalDistance(game.player.pos, mote.pos) > TUNING.pickup_radius) continue;
    game.motes.splice(index, 1);
    game.player.carried += 1;
    game.score += TUNING.score.per_mote;
    emit(events, game, "mote_picked", { carried: game.player.carried });
  }
}

function interactWithLantern(game: GameState, events: GameEvent[]): void {
  if (game.player.carried <= 0) return;
  const lantern = game.lanterns
    .filter((candidate) => !candidate.lit)
    .sort((a, b) => horizontalDistance(game.player.pos, a.pos) - horizontalDistance(game.player.pos, b.pos))[0];
  if (!lantern || horizontalDistance(game.player.pos, lantern.pos) > TUNING.interact_radius) return;

  const amount = Math.min(game.player.carried, TUNING.lantern_cost - lantern.deposited);
  if (amount <= 0) return;
  game.player.carried -= amount;
  lantern.deposited += amount;
  emit(events, game, "deposit", {
    lantern_id: lantern.id,
    amount,
    deposited: lantern.deposited,
  });
  if (lantern.deposited >= TUNING.lantern_cost) {
    lantern.lit = true;
    game.score += TUNING.score.per_lantern;
    emit(events, game, "lantern_lit", { lantern_id: lantern.id });
  }
}

function pulse(game: GameState, events: GameEvent[]): void {
  game.player.flames -= TUNING.pulse_cost;
  game.pulseCooldownTicks = Math.round(TUNING.pulse_cooldown_s * TICK_RATE);
  const stunnedIds: string[] = [];
  for (const shade of game.shades) {
    const distance = horizontalDistance(game.player.pos, shade.pos);
    if (distance > TUNING.pulse_radius) continue;
    shade.state = "stunned";
    shade.stunTicksLeft = Math.round(TUNING.pulse_stun_s * TICK_RATE);
    const dx = shade.pos[0] - game.player.pos[0];
    const dz = shade.pos[2] - game.player.pos[2];
    const length = Math.hypot(dx, dz) || 1;
    shade.pos[0] += (dx / length) * TUNING.pulse_push_m;
    shade.pos[2] += (dz / length) * TUNING.pulse_push_m;
    stunnedIds.push(shade.id);
    game.score += TUNING.score.per_stun;
  }
  emit(events, game, "pulse", { stunned_ids: stunnedIds });
}

function isInLitLanternSafeZone(game: GameState, pos: Vec3): boolean {
  return game.lanterns.some(
    (lantern) => lantern.lit && horizontalDistance(pos, lantern.pos) <= TUNING.safe_radius,
  );
}

function moveShades(game: GameState): void {
  for (const shade of game.shades) {
    if (shade.state === "stunned") {
      shade.stunTicksLeft -= 1;
      if (shade.stunTicksLeft <= 0) {
        shade.state = "chase";
        shade.stunTicksLeft = 0;
      } else {
        continue;
      }
    }
    if (isInLitLanternSafeZone(game, shade.pos)) continue;

    const dx = game.player.pos[0] - shade.pos[0];
    const dz = game.player.pos[2] - shade.pos[2];
    const distance = Math.hypot(dx, dz);
    if (distance === 0) continue;
    const step = Math.min(distance, TUNING.shade_speed / TICK_RATE);
    const nextX = shade.pos[0] + (dx / distance) * step;
    const nextZ = shade.pos[2] + (dz / distance) * step;
    const proposed: Vec3 = [nextX, shade.pos[1], nextZ];
    if (isInLitLanternSafeZone(game, proposed)) continue;
    shade.pos[0] = nextX;
    shade.pos[2] = nextZ;
  }
}

function applyShadeHits(game: GameState, events: GameEvent[]): void {
  if (game.player.invulnTicks > 0) return;
  const shade = game.shades.find(
    (candidate) =>
      candidate.state !== "stunned" &&
      horizontalDistance(game.player.pos, candidate.pos) <= TUNING.shade_hit_radius,
  );
  if (!shade) return;

  game.player.flames = Math.max(0, game.player.flames - 1);
  game.player.invulnTicks = Math.round(TUNING.invuln_s * TICK_RATE);
  const dropped = Math.floor(game.player.carried * TUNING.hit_drop_ratio);
  game.player.carried -= dropped;
  for (let index = 0; index < dropped; index += 1) {
    game.motes.push({ id: `M${game.nextMoteId++}`, pos: [game.player.pos[0], 0, game.player.pos[2]] });
  }
  emit(events, game, "player_hit", { by: "shade", flames: game.player.flames, dropped });
}

function spawnShade(game: GameState, events: GameEvent[]): void {
  const point = randomDiskPoint(game.rngState, 20, ISLAND_RADIUS - 2);
  game.rngState = point.state;
  const shade: Shade = {
    id: `S${game.nextShadeId++}`,
    pos: [point.pos[0], 1, point.pos[2]],
    state: "chase",
    stunTicksLeft: 0,
  };
  game.shades.push(shade);
  emit(events, game, "shade_spawned", { id: shade.id });
  game.nextShadeSpawnTick += 20 * TICK_RATE;
}

export function stepGame(game: GameState, input: InputState): GameEvent[] {
  if (game.status !== "playing") return [];
  const events: GameEvent[] = [];
  game.tick += 1;
  game.timeLeftTicks = Math.max(0, game.timeLeftTicks - 1);
  if (game.player.invulnTicks > 0) game.player.invulnTicks -= 1;
  if (game.pulseCooldownTicks > 0) game.pulseCooldownTicks -= 1;

  movePlayer(game, input);
  pickUpMotes(game, events);

  if (input.interact && !game.previousInput.interact) interactWithLantern(game, events);
  if (
    input.pulse &&
    !game.previousInput.pulse &&
    game.pulseCooldownTicks === 0 &&
    game.player.flames >= TUNING.pulse_cost
  ) {
    pulse(game, events);
  }

  moveShades(game);
  applyShadeHits(game, events);
  if (game.randomShades && game.shades.length < MAX_SHADES && game.tick >= game.nextShadeSpawnTick) {
    spawnShade(game, events);
  }
  game.previousInput = {
    move: [input.move[0], input.move[1]],
    cam_yaw_deg: input.cam_yaw_deg,
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
  };

  if (game.lanterns.every((lantern) => lantern.lit)) finish(game, events, "won", "all_lit");
  else if (game.player.flames <= 0) finish(game, events, "lost", "no_flames");
  else if (game.timeLeftTicks <= 0) finish(game, events, "lost", "dawn");
  return events;
}

export function countLitLanterns(game: GameState): number {
  return game.lanterns.filter((lantern) => lantern.lit).length;
}

export function createDefaultInput(): InputState {
  return EMPTY_INPUT();
}

export function getTimeLeftSeconds(game: GameState): number {
  return game.timeLeftTicks / TICK_RATE;
}

export function getNextRandomValue(game: GameState): number {
  const result = nextRandom(game.rngState);
  game.rngState = result.state;
  return result.value;
}
