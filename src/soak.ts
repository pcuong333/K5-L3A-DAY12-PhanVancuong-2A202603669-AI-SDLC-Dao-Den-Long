import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TICK_RATE, TUNING } from "./sim/config";
import { createGame, createDefaultInput, stepGame } from "./sim/game";
import { nextRandom } from "./sim/random";
import type { InputState, Night } from "./sim/types";

const DIRECTIONS: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function createSoakInputGenerator(seed: number): () => InputState {
  let state = seed >>> 0;
  let tick = 0;
  let move: [number, number] = [0, 0];

  const random = (): number => {
    const result = nextRandom(state);
    state = result.state;
    return result.value;
  };

  return () => {
    if (tick % 30 === 0) {
      const direction = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
      move = [direction[0], direction[1]];
    }
    tick += 1;
    return {
      ...createDefaultInput(),
      move: [move[0], move[1]],
      jump: random() < 0.05,
      dash: random() < 0.03,
      pulse: random() < 0.02,
      interact: random() < 0.1,
    };
  };
}

export interface SoakOptions {
  seed: number;
  nights: number;
  out: string;
}

interface SoakReport {
  nights: number;
  crashes: number;
  results: string[];
  mem_start_mb: number;
  mem_end_mb: number;
  duration_s: number;
}

export function parseSoakArgs(args: string[]): SoakOptions {
  const values = new Map<string, string>();
  const known = new Set(["--seed", "--nights", "--out"]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!known.has(key)) throw new Error(`Unknown option: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    if (values.has(key)) throw new Error(`Option supplied more than once: ${key}`);
    values.set(key, value);
    index += 1;
  }

  const seed = Number(values.get("--seed") ?? 7);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("--seed must be a non-negative safe integer");
  const nights = Number(values.get("--nights") ?? 10);
  if (!Number.isSafeInteger(nights) || nights < 1 || nights > 100) {
    throw new Error("--nights must be an integer from 1 to 100");
  }
  return { seed, nights, out: values.get("--out") ?? "soak.json" };
}

function memoryMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function nightDurationTicks(night: Night): number {
  const seconds = night === 1
    ? TUNING.night1_duration_s
    : night === 2
      ? TUNING.night2_duration_s
      : TUNING.night3_duration_s;
  return seconds * TICK_RATE;
}

export function runSoak(options: SoakOptions): SoakReport {
  const start = performance.now();
  const results: string[] = [];
  let crashes = 0;
  let game = createGame(options.seed, undefined, 1);
  const memStartMb = memoryMb();

  for (let index = 0; index < options.nights; index += 1) {
    const night = ((index % 3) + 1) as Night;
    const seed = options.seed + index;
    if (index > 0) game = createGame(seed, undefined, night);
    const nextInput = createSoakInputGenerator(seed);
    const maxTicks = nightDurationTicks(night);

    try {
      while (game.tick < maxTicks && (game.status === "playing" || game.status === "paused")) {
        stepGame(game, nextInput());
      }
      results.push(game.status);
    } catch (error) {
      crashes += 1;
      results.push("crash");
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Soak night ${index + 1} crashed: ${message}`);
    }
  }

  const report: SoakReport = {
    nights: options.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memoryMb(),
    duration_s: Math.round(((performance.now() - start) / 1000) * 10) / 10,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out === "-") process.stdout.write(output);
  else writeFileSync(options.out, output, "utf8");
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runSoak(parseSoakArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
