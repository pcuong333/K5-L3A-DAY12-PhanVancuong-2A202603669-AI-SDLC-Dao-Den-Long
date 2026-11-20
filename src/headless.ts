import { readFileSync, writeFileSync } from "node:fs";
import { TICK_RATE } from "./sim/config";
import { createGame, getTimeLeftSeconds, stepGame } from "./sim/game";
import type { GameState, InputFrame, InputState, Scenario, Vec3 } from "./sim/types";

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

function parseScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new ContractInputError("scenario must be a JSON object");
  const scenario: Scenario = {};

  if (value.player !== undefined) {
    if (!isRecord(value.player)) throw new ContractInputError("scenario.player must be an object");
    const player: NonNullable<Scenario["player"]> = {};
    if (value.player.pos !== undefined) player.pos = parseVec3(value.player.pos, "scenario.player.pos");
    if (value.player.carried !== undefined) {
      if (!Number.isInteger(value.player.carried) || (value.player.carried as number) < 0) {
        throw new ContractInputError("scenario.player.carried must be a non-negative integer");
      }
      player.carried = value.player.carried as number;
    }
    if (value.player.flames !== undefined) {
      if (!Number.isInteger(value.player.flames) || (value.player.flames as number) < 0) {
        throw new ContractInputError("scenario.player.flames must be a non-negative integer");
      }
      player.flames = value.player.flames as number;
    }
    scenario.player = player;
  }

  for (const key of ["random_motes", "random_shades"] as const) {
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
      const mote: { id?: string; pos: Vec3 } = {
        pos: parseVec3(entry.pos, `scenario.motes[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.motes[${index}].id must be a non-empty string`);
        }
        mote.id = entry.id;
      }
      return mote;
    });
  }

  if (value.shades !== undefined) {
    if (!Array.isArray(value.shades)) throw new ContractInputError("scenario.shades must be an array");
    scenario.shades = value.shades.map((entry, index) => {
      if (!isRecord(entry)) throw new ContractInputError(`scenario.shades[${index}] must be an object`);
      const shade: { id?: string; pos: Vec3 } = {
        pos: parseVec3(entry.pos, `scenario.shades[${index}].pos`),
      };
      if (entry.id !== undefined) {
        if (typeof entry.id !== "string" || entry.id.length === 0) {
          throw new ContractInputError(`scenario.shades[${index}].id must be a non-empty string`);
        }
        shade.id = entry.id;
      }
      return shade;
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
    for (const key of ["jump", "interact", "pulse"] as const) {
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
    tick: game.tick,
    sim_tick: game.tick,
    state: game.status,
    time_left_s: round(getTimeLeftSeconds(game)),
    score: game.score,
    player: {
      pos: game.player.pos.map(round),
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
    motes: game.motes.map((mote) => ({ id: mote.id, pos: mote.pos.map(round) })),
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
  if (night !== 1) throw new Error("Only --night 1 is supported in Phase 1");
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
    game = createGame(seed, scenario);
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
  };
  let frameIndex = 0;

  while (game.tick < requestedTicks && game.status === "playing") {
    while (frameIndex < inputFrames.length && inputFrames[frameIndex].tick <= game.tick) {
      const frame = inputFrames[frameIndex];
      if (frame.move !== undefined) input.move = [frame.move[0], frame.move[1]];
      if (frame.cam_yaw_deg !== undefined) input.cam_yaw_deg = frame.cam_yaw_deg;
      if (frame.jump !== undefined) input.jump = frame.jump;
      if (frame.interact !== undefined) input.interact = frame.interact;
      if (frame.pulse !== undefined) input.pulse = frame.pulse;
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
