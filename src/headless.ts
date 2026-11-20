import { readFileSync, writeFileSync } from "node:fs";
import { TICK_RATE } from "./sim/config";
import { createGame, getTimeLeftSeconds, stepGame } from "./sim/game";
import type {
  DrifterStatus,
  GameState,
  InputFrame,
  InputState,
  Night,
  Scenario,
  ShadeStatus,
  Vec3,
} from "./sim/types";

class ContractInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseVec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(finiteNumber)) {
    throw new ContractInputError(`${label} must be a three-number array`);
  }
  return [value[0], value[1], value[2]];
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ContractInputError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function parseShadeStatus(value: unknown, label: string): ShadeStatus {
  if (value !== "spawning" && value !== "wander" && value !== "chase" && value !== "recoil" && value !== "stunned") {
    throw new ContractInputError(`${label} is not a valid shade state`);
  }
  return value;
}

function parseDrifterStatus(value: unknown, label: string): DrifterStatus {
  if (value !== "idle" && value !== "chase" && value !== "flee" && value !== "removed") {
    throw new ContractInputError(`${label} is not a valid drifter state`);
  }
  return value;
}

function parseScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new ContractInputError("scenario must be a JSON object");
  const scenario: Scenario = {};

  if (value.player !== undefined) {
    if (!isRecord(value.player)) throw new ContractInputError("scenario.player must be an object");
    const player: NonNullable<Scenario["player"]> = {};
    if (value.player.pos !== undefined) player.pos = parseVec3(value.player.pos, "scenario.player.pos");
    if (value.player.vel !== undefined) player.vel = parseVec3(value.player.vel, "scenario.player.vel");
    if (value.player.carried !== undefined) player.carried = nonNegativeInteger(value.player.carried, "scenario.player.carried");
    if (value.player.flames !== undefined) player.flames = nonNegativeInteger(value.player.flames, "scenario.player.flames");
    if (value.player.invuln_ticks !== undefined) {
      player.invuln_ticks = nonNegativeInteger(value.player.invuln_ticks, "scenario.player.invuln_ticks");
    }
    if (value.player.dash_cd_ticks !== undefined) {
      player.dash_cd_ticks = nonNegativeInteger(value.player.dash_cd_ticks, "scenario.player.dash_cd_ticks");
    }
    if (value.player.pulse_cd_ticks !== undefined) {
      player.pulse_cd_ticks = nonNegativeInteger(value.player.pulse_cd_ticks, "scenario.player.pulse_cd_ticks");
    }
    if (value.player.charm_ticks !== undefined) {
      player.charm_ticks = nonNegativeInteger(value.player.charm_ticks, "scenario.player.charm_ticks");
    }
    scenario.player = player;
  }

  for (const key of ["random_motes", "random_shades", "random_drifters", "wind_enabled"] as const) {
    const setting = value[key];
    if (setting !== undefined && typeof setting !== "boolean") {
      throw new ContractInputError(`scenario.${key} must be a boolean`);
    }
    if (setting !== undefined) scenario[key] = setting;
  }

  if (value.motes !== undefined) {
    if (!Array.isArray(value.motes)) throw new ContractInputError("scenario.motes must be an array");
    scenario.motes = value.motes.map((entry, index) => {
      if (Array.isArray(entry)) return parseVec3(entry, `scenario.motes[${index}]`);
      if (!isRecord(entry)) throw new ContractInputError(`scenario.motes[${index}] must be a position or object`);
      const mote: NonNullable<Scenario["motes"]>[number] = {
        pos: parseVec3(entry.pos, `scenario.motes[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.motes[${index}].id must be a non-empty string`);
        }
        mote.id = entry.id;
      }
      if (entry.kind !== undefined) {
        if (entry.kind !== "random" && entry.kind !== "dropped") {
          throw new ContractInputError(`scenario.motes[${index}].kind must be random or dropped`);
        }
        mote.kind = entry.kind;
      }
      if (entry.ttl_ticks !== undefined) {
        mote.ttl_ticks = nonNegativeInteger(entry.ttl_ticks, `scenario.motes[${index}].ttl_ticks`);
      }
      return mote;
    });
  }

  if (value.shades !== undefined) {
    if (!Array.isArray(value.shades)) throw new ContractInputError("scenario.shades must be an array");
    scenario.shades = value.shades.map((entry, index) => {
      if (!isRecord(entry)) throw new ContractInputError(`scenario.shades[${index}] must be an object`);
      const shade: NonNullable<Scenario["shades"]>[number] = {
        pos: parseVec3(entry.pos, `scenario.shades[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.shades[${index}].id must be a non-empty string`);
        }
        shade.id = entry.id;
      }
      if (entry.state !== undefined) shade.state = parseShadeStatus(entry.state, `scenario.shades[${index}].state`);
      if (entry.state_ticks_left !== undefined) {
        shade.state_ticks_left = nonNegativeInteger(entry.state_ticks_left, `scenario.shades[${index}].state_ticks_left`);
      }
      return shade;
    });
  }

  if (value.drifters !== undefined) {
    if (!Array.isArray(value.drifters)) throw new ContractInputError("scenario.drifters must be an array");
    scenario.drifters = value.drifters.map((entry, index) => {
      if (!isRecord(entry)) throw new ContractInputError(`scenario.drifters[${index}] must be an object`);
      const drifter: NonNullable<Scenario["drifters"]>[number] = {
        pos: parseVec3(entry.pos, `scenario.drifters[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.drifters[${index}].id must be a non-empty string`);
        }
        drifter.id = entry.id;
      }
      if (entry.state !== undefined) {
        drifter.state = parseDrifterStatus(entry.state, `scenario.drifters[${index}].state`);
      }
      if (entry.stolen !== undefined) {
        drifter.stolen = nonNegativeInteger(entry.stolen, `scenario.drifters[${index}].stolen`);
      }
      if (entry.state_ticks_left !== undefined) {
        drifter.state_ticks_left = nonNegativeInteger(
          entry.state_ticks_left,
          `scenario.drifters[${index}].state_ticks_left`,
        );
      }
      return drifter;
    });
  }

  if (value.charms !== undefined) {
    if (!Array.isArray(value.charms)) throw new ContractInputError("scenario.charms must be an array");
    scenario.charms = value.charms.map((entry, index) => {
      if (!isRecord(entry)) throw new ContractInputError(`scenario.charms[${index}] must be an object`);
      const charm: NonNullable<Scenario["charms"]>[number] = {
        pos: parseVec3(entry.pos, `scenario.charms[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.charms[${index}].id must be a non-empty string`);
        }
        charm.id = entry.id;
      }
      if (entry.available !== undefined) {
        if (typeof entry.available !== "boolean") {
          throw new ContractInputError(`scenario.charms[${index}].available must be a boolean`);
        }
        charm.available = entry.available;
      }
      if (entry.respawn_ticks !== undefined) {
        charm.respawn_ticks = nonNegativeInteger(entry.respawn_ticks, `scenario.charms[${index}].respawn_ticks`);
      }
      return charm;
    });
  }

  if (value.lanterns !== undefined) {
    if (!Array.isArray(value.lanterns)) throw new ContractInputError("scenario.lanterns must be an array");
    scenario.lanterns = value.lanterns.map((entry, index) => {
      if (!isRecord(entry) || typeof entry.id !== "string") {
        throw new ContractInputError(`scenario.lanterns[${index}] must have a string id`);
      }
      const lantern: NonNullable<Scenario["lanterns"]>[number] = { id: entry.id };
      if (entry.pos !== undefined) lantern.pos = parseVec3(entry.pos, `scenario.lanterns[${index}].pos`);
      if (entry.deposited !== undefined) {
        if (!Number.isInteger(entry.deposited) || (entry.deposited as number) < 0) {
          throw new ContractInputError(`scenario.lanterns[${index}].deposited must be a non-negative integer`);
        }
        lantern.deposited = entry.deposited as number;
      }
      if (entry.lit !== undefined) {
        if (typeof entry.lit !== "boolean") {
          throw new ContractInputError(`scenario.lanterns[${index}].lit must be a boolean`);
        }
        lantern.lit = entry.lit;
      }
      return lantern;
    });
  }

  if (value.time_left_s !== undefined) {
    if (!finiteNumber(value.time_left_s) || value.time_left_s < 0) {
      throw new ContractInputError("scenario.time_left_s must be a non-negative number");
    }
    scenario.time_left_s = value.time_left_s;
  }
  return scenario;
}

function parseInputs(value: unknown): InputFrame[] {
  if (!isRecord(value) || !Array.isArray(value.frames)) {
    throw new ContractInputError("inputs must be an object containing a frames array");
  }
  let previousTick = -1;
  return value.frames.map((entry, index) => {
    if (!isRecord(entry) || !Number.isSafeInteger(entry.tick) || (entry.tick as number) < 0) {
      throw new ContractInputError(`inputs.frames[${index}].tick must be a non-negative integer`);
    }
    const tick = entry.tick as number;
    if (tick <= previousTick) {
      throw new ContractInputError("inputs frame ticks must increase strictly");
    }
    previousTick = tick;
    const frame: InputFrame = { tick };
    if (entry.move !== undefined) {
      if (
        !Array.isArray(entry.move) ||
        entry.move.length !== 2 ||
        !entry.move.every((part) => finiteNumber(part) && part >= -1 && part <= 1)
      ) {
        throw new ContractInputError(`inputs.frames[${index}].move must be a two-number array in [-1, 1]`);
      }
      frame.move = [entry.move[0], entry.move[1]];
    }
    if (entry.cam_yaw_deg !== undefined) {
      if (!finiteNumber(entry.cam_yaw_deg)) {
        throw new ContractInputError(`inputs.frames[${index}].cam_yaw_deg must be a number`);
      }
      frame.cam_yaw_deg = entry.cam_yaw_deg;
    }
    for (const key of ["jump", "interact", "pulse", "dash", "pause"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "boolean") {
        throw new ContractInputError(`inputs.frames[${index}].${key} must be a boolean`);
      }
      if (entry[key] !== undefined) frame[key] = entry[key];
    }
    return frame;
  });
}

function loadJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ContractInputError(`cannot read ${label} file "${path}": ${message}`);
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function snapshot(game: GameState): Record<string, unknown> {
  return {
    type: "snapshot",
    night: game.night,
    tick: game.tick,
    sim_tick: game.simTick,
    state: game.status,
    wind: { active: game.wind.active, dir_deg: round(game.wind.dirDeg) },
    time_left_s: round(getTimeLeftSeconds(game)),
    score: game.score,
    player: {
      pos: game.player.pos.map(round),
      vel: game.player.vel.map(round),
      grounded: game.player.grounded,
      invuln: game.player.invulnTicks > 0,
      dash_cd_s: round(game.player.dashCooldownTicks / TICK_RATE),
      pulse_cd_s: round(game.player.pulseCooldownTicks / TICK_RATE),
      charm_s: round(game.player.charmTicksLeft / TICK_RATE),
      flames: game.player.flames,
      carried: game.player.carried,
    },
    lanterns: game.lanterns.map((lantern) => ({
      id: lantern.id,
      pos: lantern.pos.map(round),
      lit: lantern.lit,
      deposited: lantern.deposited,
    })),
    shades: game.shades.map((shade) => ({
      id: shade.id,
      pos: shade.pos.map(round),
      state: shade.state,
    })),
    motes_active: game.motes.length,
    motes: game.motes.map((mote) => ({
      id: mote.id,
      pos: mote.pos.map(round),
      kind: mote.kind,
      ttl_s: mote.ttlTicksLeft === undefined ? null : round(mote.ttlTicksLeft / TICK_RATE),
    })),
    drifters: game.drifters.map((drifter) => ({
      id: drifter.id,
      pos: drifter.pos.map(round),
      state: drifter.state,
      stolen: drifter.stolen,
    })),
    charms: game.charms.map((charm) => ({
      id: charm.id,
      available: charm.available,
      respawn_s: round(charm.respawnTicksLeft / TICK_RATE),
    })),
  };
}

function parseArgs(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  const known = new Set(["--seed", "--night", "--scenario", "--inputs", "--ticks", "--out", "--snapshot-every"]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!known.has(key)) throw new Error(`Unknown option: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (values.has(key)) throw new Error(`Option supplied more than once: ${key}`);
    values.set(key, value);
    index += 1;
  }
  return values;
}

function requiredInteger(options: Map<string, string>, name: string, minimum: number): number {
  const value = options.get(name);
  if (value === undefined) throw new Error(`Missing required option ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

export function runHeadless(args: string[]): string {
  const options = parseArgs(args);
  const seed = requiredInteger(options, "--seed", -Number.MAX_SAFE_INTEGER);
  const night = requiredInteger(options, "--night", 1);
  if (night > 3) throw new Error("--night must be 1, 2, or 3");
  const selectedNight = night as Night;
  const requestedTicks = requiredInteger(options, "--ticks", 0);
  const snapshotEvery = options.has("--snapshot-every")
    ? requiredInteger(options, "--snapshot-every", 1)
    : 10;
  const outPath = options.get("--out");
  if (!outPath) throw new Error("Missing required option --out");

  const scenario = options.has("--scenario")
    ? parseScenario(loadJson(options.get("--scenario") as string, "scenario"))
    : undefined;
  const inputFrames = options.has("--inputs")
    ? parseInputs(loadJson(options.get("--inputs") as string, "inputs"))
    : [];
  let game: GameState;
  try {
    game = createGame(seed, scenario, selectedNight);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (scenario !== undefined) throw new ContractInputError(`invalid scenario: ${message}`);
    throw error;
  }
  const lines = [JSON.stringify(snapshot(game))];
  const input: InputState = {
    move: [0, 0] as [number, number],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
  let frameIndex = 0;

  while (game.tick < requestedTicks && (game.status === "playing" || game.status === "paused")) {
    while (frameIndex < inputFrames.length && inputFrames[frameIndex].tick <= game.tick) {
      const frame = inputFrames[frameIndex];
      if (frame.move !== undefined) input.move = [frame.move[0], frame.move[1]];
      if (frame.cam_yaw_deg !== undefined) input.cam_yaw_deg = frame.cam_yaw_deg;
      if (frame.jump !== undefined) input.jump = frame.jump;
      if (frame.interact !== undefined) input.interact = frame.interact;
      if (frame.pulse !== undefined) input.pulse = frame.pulse;
      if (frame.dash !== undefined) input.dash = frame.dash;
      if (frame.pause !== undefined) input.pause = frame.pause;
      frameIndex += 1;
    }

    lines.push(...stepGame(game, input).map((event) => JSON.stringify(event)));
    if (game.tick % snapshotEvery === 0) lines.push(JSON.stringify(snapshot(game)));
  }

  lines.push(JSON.stringify({
    type: "end",
    ticks: game.tick,
    state: game.status,
    score: game.score,
  }));
  const output = `${lines.join("\n")}\n`;
  if (outPath === "-") process.stdout.write(output);
  else writeFileSync(outPath, output, "utf8");
  return output;
}

try {
  runHeadless(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = error instanceof ContractInputError ? 2 : 1;
}

export { TICK_RATE };
