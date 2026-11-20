import { describe, expect, it } from "vitest";
import { parseBenchArgs } from "../src/bench";
import { createBenchmarkScenario } from "../src/sim/benchmark";
import { createGame } from "../src/sim/game";

describe("Contract v1.3 benchmark", () => {
  it("creates the exact seeded Night 1 rendering scenario", () => {
    const scenario = createBenchmarkScenario(42);
    const game = createGame(42, scenario, 1);
    const repeated = createGame(42, createBenchmarkScenario(42), 1);

    expect(game.player.pos).toEqual([0, 0, 0]);
    expect(game.motes).toHaveLength(100);
    expect(game.shades).toHaveLength(200);
    expect(game.shades.every((shade) => shade.state === "wander")).toBe(true);
    expect(game.lanterns.slice(0, 3).map((lantern) => [lantern.id, lantern.lit, lantern.fuelUnits])).toEqual([
      ["L1", true, 6000],
      ["L2", true, 6000],
      ["L3", true, 6000],
    ]);
    expect(game.randomMotes).toBe(false);
    expect(game.randomShades).toBe(false);
    expect(game.randomDrifters).toBe(false);
    expect(game.windEnabled).toBe(false);
    expect(game.motes.map((mote) => mote.pos)).toEqual(repeated.motes.map((mote) => mote.pos));
    expect(game.shades.map((shade) => shade.pos)).toEqual(repeated.shades.map((shade) => shade.pos));
  });

  it("parses the documented benchmark command options", () => {
    expect(parseBenchArgs(["--seed", "42", "--duration", "30", "--out", "bench.json"])).toEqual({
      seed: 42,
      duration: 30,
      out: "bench.json",
      browser: undefined,
      screenshot: undefined,
      headless: false,
    });
  });
});
