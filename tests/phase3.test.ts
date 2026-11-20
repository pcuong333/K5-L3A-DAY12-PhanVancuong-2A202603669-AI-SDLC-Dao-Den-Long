import { describe, expect, it } from "vitest";
import { createDefaultInput, createGame, getPlayerCapacity, stepGame } from "../src/sim/game";
import type { Night, Scenario } from "../src/sim/types";

function quietGame(scenario: Scenario = {}, night: Night = 1) {
  return createGame(29, {
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    motes: [],
    shades: [],
    drifters: [],
    charms: [],
    ...scenario,
  }, night);
}

describe("Phase 3 lamp contract", () => {
  it("burns fuel out exactly at zero and retains the lamp's lighting history", () => {
    const game = quietGame({
      lanterns: [{ id: "L1", pos: [0, 0, 10], lit: true, fuel: 1, ever_lit: true }],
    });
    const events = Array.from({ length: 60 }, () => stepGame(game, createDefaultInput())).flat();

    expect(game.lanterns[0]).toMatchObject({
      lit: false,
      fuelUnits: 0,
      deposited: 0,
      everLit: true,
    });
    expect(events.filter((event) => event.name === "lantern_out")).toHaveLength(1);
  });

  it("rounds refueling up to whole motes and does not spend on a full lamp", () => {
    const game = quietGame({
      player: { pos: [0, 0, 25], carried: 3 },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true, fuel: 95 }],
    });
    const input = createDefaultInput();
    input.interact = true;
    const events = stepGame(game, input);

    expect(events.find((event) => event.name === "refuel")?.data).toEqual({
      lantern_id: "L1",
      amount: 1,
      fuel: 100,
    });
    expect(game.player.carried).toBe(2);
    expect(game.lanterns[0].fuelUnits).toBe(100 * 60 - 1);
    expect(game.score).toBe(5);

    const fullLamps = Array.from({ length: 5 }, (_, index) => ({
      id: `L${index + 1}`,
      lit: true,
      fuel: 100,
    }));
    const fullGame = quietGame({
      player: { pos: [0, 0, 25], carried: 3 },
      lanterns: fullLamps,
    });
    const fullEvents = stepGame(fullGame, input);

    expect(fullGame.player.carried).toBe(3);
    expect(fullGame.score).toBe(0);
    expect(fullEvents.some((event) => event.name === "refuel")).toBe(false);
  });

  it("relights for five motes, increments successful lights, and expands capacity", () => {
    const game = quietGame({
      player: { pos: [0, 0, 25], carried: 5 },
      lanterns: [{
        id: "L1",
        pos: [0, 0, 25],
        lit: false,
        fuel: 0,
        ever_lit: true,
      }],
    });
    const input = createDefaultInput();
    input.interact = true;
    const events = stepGame(game, input);

    expect(events.find((event) => event.name === "lantern_lit")?.data).toEqual({
      lantern_id: "L1",
      relight: true,
    });
    expect(game.lanterns[0]).toMatchObject({ lit: true, relitCount: 1, everLit: true });
    expect(game.player.successfulLights).toBe(1);
    expect(game.player.carried).toBe(0);
    expect(game.score).toBe(65);
    expect(getPlayerCapacity(game)).toBe(12);

    const cappedGame = quietGame({
      player: { pos: [0, 0, 25], carried: 10, successful_lights: 5 },
      lanterns: [{ id: "L1", pos: [0, 0, 25] }],
    });
    stepGame(cappedGame, input);
    expect(cappedGame.player.successfulLights).toBe(6);
    expect(getPlayerCapacity(cappedGame)).toBe(20);
  });

  it("drains a weak lantern at five fuel per second and emits a one-second summary", () => {
    const game = quietGame({
      player: { pos: [10, 0, 10] },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true, fuel: 29 }],
      shades: [{
        id: "S-drain",
        pos: [0, 1, 24],
        state: "drain",
        target_lantern_id: "L1",
      }],
    });
    const events = Array.from({ length: 60 }, () => stepGame(game, createDefaultInput())).flat();

    expect(game.lanterns[0].fuelUnits).toBe(23 * 60);
    expect(game.shades[0].state).toBe("drain");
    expect(events.filter((event) => event.name === "fuel_drain").map((event) => event.data)).toEqual([
      { lantern_id: "L1", shade_id: "S-drain", fuel: 23 },
    ]);
  });

  it("stacks multiple drains and selects the nearest weak lamp before an unlit one", () => {
    const stackedGame = quietGame({
      player: { pos: [10, 0, 10] },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true, fuel: 29 }],
      shades: [
        { id: "S1", pos: [0, 1, 24], state: "drain", target_lantern_id: "L1" },
        { id: "S2", pos: [0.5, 1, 24], state: "drain", target_lantern_id: "L1" },
      ],
    });
    const drainEvents = Array.from({ length: 60 }, () => stepGame(stackedGame, createDefaultInput())).flat();
    expect(stackedGame.lanterns[0].fuelUnits).toBe(18 * 60);
    expect(drainEvents.filter((event) => event.name === "fuel_drain").map((event) => event.data.fuel)).toEqual([
      18.1,
      18,
    ]);

    const targetGame = quietGame({
      player: { pos: [20, 0, 20] },
      lanterns: [
        { id: "L1", pos: [0, 0, 10], lit: true, fuel: 20 },
        { id: "L2", pos: [0, 0, -10], lit: true, fuel: 20 },
        { id: "L3", pos: [0, 0, 1], lit: false, fuel: 0 },
      ],
      shades: [{ id: "S-wander", pos: [0, 1, 0], state: "wander" }],
    });

    stepGame(targetGame, createDefaultInput());

    expect(targetGame.shades[0].targetLanternId).toBe("L1");
    expect(targetGame.shades[0].state).toBe("wander");
  });

  it("switches a draining Shade to chase when Mây gets close", () => {
    const game = quietGame({
      player: { pos: [0, 0, 18] },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true, fuel: 29 }],
      shades: [{
        id: "S-drain",
        pos: [0, 1, 24],
        state: "drain",
        target_lantern_id: "L1",
      }],
    });

    stepGame(game, createDefaultInput());

    expect(game.shades[0].state).toBe("chase");
    expect(game.lanterns[0].fuelUnits).toBe(29 * 60 - 1);
  });

  it("pushes Shades away when refueling makes a lantern safe", () => {
    const game = quietGame({
      player: { pos: [0, 0, 24], carried: 1 },
      lanterns: [{ id: "L1", pos: [0, 0, 25], lit: true, fuel: 29 }],
      shades: [{
        id: "S-drain",
        pos: [1, 1, 25],
        state: "drain",
        target_lantern_id: "L1",
      }],
    });
    const input = createDefaultInput();
    input.interact = true;
    const events = stepGame(game, input);

    expect(events.find((event) => event.name === "refuel")?.data).toMatchObject({ amount: 1, fuel: 39 });
    expect(game.shades[0].state).toBe("wander");
    expect(game.shades[0].safePushTicksLeft).toBe(29);
    expect(game.shades[0].pos[0]).toBeGreaterThan(1);
  });

  it("awards the draining-Shade pulse score", () => {
    const game = quietGame({
      player: { pos: [0, 0, 0], carried: 3 },
      lanterns: [{ id: "L1", pos: [2, 0, 0], lit: true, fuel: 29 }],
      shades: [{
        id: "S-drain",
        pos: [2, 1, 0],
        state: "drain",
        target_lantern_id: "L1",
      }],
    });
    const input = createDefaultInput();
    input.pulse = true;

    stepGame(game, input);

    expect(game.score).toBe(15);
    expect(game.player.carried).toBe(0);
    expect(game.shades[0].state).toBe("stunned");
  });
});

describe("Phase 3 dawn contract", () => {
  function dawnGame(litCount: number, flames = 3, night: Night = 2) {
    const lanternCount = night === 1 ? 5 : night === 2 ? 6 : 7;
    const lanterns = Array.from({ length: lanternCount }, (_, index) => ({
      id: `L${index + 1}`,
      lit: index < litCount,
      fuel: index < litCount ? 100 : 0,
    }));
    return quietGame({
      player: { flames },
      lanterns,
      time_left_s: 1 / 60,
    }, night);
  }

  it("requires the ceiling of sixty percent of lanterns for each night", () => {
    for (const [night, requiredLit] of [[1, 3], [2, 4], [3, 5]] as const) {
      const pass = dawnGame(requiredLit, 3, night);
      const passEvents = stepGame(pass, createDefaultInput());
      expect(pass.status).toBe("won");
      expect(pass.reason).toBe("dawn_survived");
      expect(passEvents.at(-1)?.data).toMatchObject({ result: "won", reason: "dawn_survived" });

      const fail = dawnGame(requiredLit - 1, 3, night);
      stepGame(fail, createDefaultInput());
      expect(fail.status).toBe("lost");
      expect(fail.reason).toBe("dawn");
    }
  });

  it("prioritizes zero flames over a successful dawn lamp count", () => {
    const game = dawnGame(6, 0);

    stepGame(game, createDefaultInput());

    expect(game.status).toBe("lost");
    expect(game.reason).toBe("no_flames");
  });
});
