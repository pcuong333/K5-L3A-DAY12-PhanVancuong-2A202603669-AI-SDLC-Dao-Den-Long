import { describe, expect, it } from "vitest";
import { createDefaultInput, createGame, getFloorHeight, stepGame } from "../src/sim/game";

describe("Phase 2 simulation", () => {
  it("collects motes only within the configured pickup radius", () => {
    const game = createGame(12, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [[0, 0, 0.5], [0, 0, 1.5]],
      shades: [],
    });

    stepGame(game, createDefaultInput());

    expect(game.player.carried).toBe(1);
    expect(game.motes.map((mote) => mote.id)).toEqual(["M2"]);
    expect(game.score).toBe(10);
  });

  it("deposits carried motes and wins after the final lantern is lit", () => {
    const game = createGame(4, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      drifters: [],
      charms: [],
      player: { carried: 10 },
      lanterns: [
        { id: "L1", pos: [0, 0, 0] },
        { id: "L2", lit: true },
        { id: "L3", lit: true },
        { id: "L4", lit: true },
        { id: "L5", lit: true },
      ],
    });
    const input = createDefaultInput();
    input.interact = true;

    const events = stepGame(game, input);

    expect(game.status).toBe("won");
    expect(game.lanterns[0].deposited).toBe(10);
    expect(game.player.carried).toBe(0);
    expect(events.map((event) => event.name)).toEqual(["night_start", "deposit", "lantern_lit", "game_over"]);
  });

  it("uses true 3D distance for lantern interaction", () => {
    const makeGame = (height: number) => createGame(4, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      drifters: [],
      charms: [],
      player: { carried: 10 },
      lanterns: [
        { id: "L1", pos: [0, height, 0] },
        { id: "L2", lit: true },
        { id: "L3", lit: true },
        { id: "L4", lit: true },
        { id: "L5", lit: true },
      ],
    });
    const input = createDefaultInput();
    input.interact = true;

    const outsideRange = makeGame(2.01);
    stepGame(outsideRange, input);
    expect(outsideRange.lanterns[0].deposited).toBe(0);
    expect(outsideRange.player.carried).toBe(10);

    const onBoundary = makeGame(2);
    stepGame(onBoundary, input);
    expect(onBoundary.lanterns[0].deposited).toBe(10);
  });

  it("spends three motes and pushes a shade over fifteen ticks when pulsed", () => {
    const game = createGame(5, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      player: { carried: 3 },
      shades: [{ id: "S-test", pos: [2, 1, 0] }],
    });
    const input = createDefaultInput();
    input.pulse = true;

    const events = stepGame(game, input);

    expect(events.find((event) => event.name === "pulse")?.data).toEqual({ stunned_ids: ["S-test"] });
    expect(game.shades[0].state).toBe("stunned");
    expect(game.shades[0].pos[0]).toBeCloseTo(2 + 4 / 15);
    expect(game.player.carried).toBe(0);
    expect(game.player.flames).toBe(3);
  });

  it("produces identical state and events for the same seed and inputs", () => {
    const scenario = { random_motes: false, random_shades: false, random_drifters: false, motes: [[0, 0, 1] as [number, number, number]] };
    const first = createGame(987, scenario);
    const second = createGame(987, scenario);
    const input = createDefaultInput();
    input.move = [0.25, 1];

    for (let tick = 0; tick < 120; tick += 1) {
      expect(stepGame(first, input)).toEqual(stepGame(second, input));
    }
    expect(first).toEqual(second);
  });

  it("drops the configured fraction of carried motes after a shade hit", () => {
    const game = createGame(9, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [{ pos: [1, 1, 0] }],
      player: { carried: 4 },
    });

    const events = stepGame(game, createDefaultInput());

    expect(events.find((event) => event.name === "player_hit")?.data).toEqual({
      by: "shade",
      flames: 2,
      dropped: 2,
    });
    expect(game.player.carried).toBe(2);
    expect(game.motes).toHaveLength(2);
  });

  it("ends the game when the last unit of light is lost", () => {
    const game = createGame(10, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [{ pos: [1, 1, 0] }],
      player: { flames: 1 },
    });

    const events = stepGame(game, createDefaultInput());

    expect(game.status).toBe("lost");
    expect(game.reason).toBe("no_flames");
    expect(events.at(-1)?.data).toEqual({ result: "lost", reason: "no_flames" });
  });

  it("uses the standardized movement acceleration and night-specific maps", () => {
    const game = createGame(11, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      charms: [],
    });
    const input = createDefaultInput();
    input.move = [0, 1];
    stepGame(game, input);
    expect(game.player.vel[2]).toBeCloseTo(1);
    for (let tick = 0; tick < 5; tick += 1) stepGame(game, input);
    expect(game.player.vel[2]).toBeCloseTo(6);

    expect(getFloorHeight(1, 39, 0)).toBe(0);
    expect(getFloorHeight(1, 41, 0)).toBeUndefined();
    expect(getFloorHeight(2, 35, 0)).toBe(0);
    expect(getFloorHeight(2, 35, 10)).toBeUndefined();
    expect(getFloorHeight(3, 0, 0)).toBe(6);
    expect(getFloorHeight(3, 18, 10)).toBe(3);
    expect(getFloorHeight(3, 23.3827, 13.5)).toBeCloseTo(1.5);
  });

  it("launches from both island jump-pad designs with their specified velocities", () => {
    const quiet = {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      drifters: [],
      charms: [],
    };
    const night2 = createGame(1, { ...quiet, player: { pos: [20, 0, 18] } }, 2);
    expect(stepGame(night2, createDefaultInput()).some((event) => event.name === "spring_launched")).toBe(true);
    expect(night2.player.vel[1]).toBe(14);
    expect(Math.hypot(night2.player.vel[0], night2.player.vel[2])).toBeCloseTo(24);

    const night3 = createGame(1, { ...quiet, player: { pos: [0, 3, 13] } }, 3);
    expect(stepGame(night3, createDefaultInput()).some((event) => event.name === "spring_launched")).toBe(true);
    expect(night3.player.vel).toEqual([0, 12, -8]);
  });

  it("starts each night with twenty distinct motes and spawns on the 240-tick schedule", () => {
    const game = createGame(42);
    expect(game.motes).toHaveLength(20);
    expect(new Set(game.motes.map((mote) => mote.pos.join(","))).size).toBe(20);
    for (let tick = 0; tick < 240; tick += 1) stepGame(game, createDefaultInput());
    expect(game.motes).toHaveLength(21);
  });

  it("keeps simulation time and timers frozen while paused", () => {
    const game = createGame(8, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      charms: [],
    });
    const timeLeft = game.timeLeftTicks;
    const pause = createDefaultInput();
    pause.pause = true;
    expect(stepGame(game, pause).some((event) => event.name === "paused")).toBe(true);
    expect(game.tick).toBe(1);
    expect(game.simTick).toBe(0);
    expect(game.timeLeftTicks).toBe(timeLeft);
    stepGame(game, pause);
    expect(game.simTick).toBe(0);

    const release = createDefaultInput();
    stepGame(game, release);
    expect(game.simTick).toBe(0);
    expect(stepGame(game, pause).some((event) => event.name === "resumed")).toBe(true);
    expect(game.simTick).toBe(1);
  });

  it("dashes once per press and starts its cooldown without granting invulnerability", () => {
    const game = createGame(3, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      charms: [],
    });
    const input = createDefaultInput();
    input.dash = true;
    stepGame(game, input);
    expect(game.player.vel[2]).toBe(14);
    expect(game.player.dashCooldownTicks).toBe(90);
    expect(game.player.invulnTicks).toBe(0);
    for (let tick = 0; tick < 15; tick += 1) stepGame(game, input);
    expect(game.player.dashTicksLeft).toBe(0);
    expect(game.player.dashCooldownTicks).toBeGreaterThan(0);
  });

  it("falls even while invulnerable, loses all carried motes, and respawns after sixty ticks", () => {
    const game = createGame(6, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      charms: [],
      player: { pos: [0, -10.1, 0], carried: 4, flames: 2, invuln_ticks: 100 },
    });
    const event = stepGame(game, createDefaultInput()).find((entry) => entry.name === "player_hit");
    expect(event?.data).toEqual({ by: "fall", flames: 1, lost: 4 });
    for (let tick = 0; tick < 60; tick += 1) stepGame(game, createDefaultInput());
    expect(game.player.pos).toEqual([0, 0, 0]);
    expect(game.player.invulnTicks).toBeGreaterThan(0);
  });

  it("lets a Gió Lạc steal motes and return them when pulsed while fleeing", () => {
    const game = createGame(2, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      player: { carried: 6 },
      drifters: [{ id: "D-test", pos: [0, 1, 1], state: "chase" }],
    }, 2);
    const stealEvents = stepGame(game, createDefaultInput());
    expect(stealEvents.find((event) => event.name === "drifter_steal")?.data).toEqual({
      drifter_id: "D-test",
      amount: 3,
      carried: 3,
    });
    const pulseInput = createDefaultInput();
    pulseInput.pulse = true;
    const dropEvents = stepGame(game, pulseInput);
    expect(dropEvents.find((event) => event.name === "drifter_drop")?.data).toEqual({
      drifter_id: "D-test",
      amount: 3,
    });
    expect(game.motes[0].kind).toBe("dropped");
  });

  it("collects and respawns a Gió Bùa on the 2700-tick timer", () => {
    const game = createGame(10, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      charms: [{ id: "C-test", pos: [0, 0, 0] }],
    }, 2);
    const events = stepGame(game, createDefaultInput());
    expect(events.find((event) => event.name === "charm_picked")?.data).toEqual({
      charm_id: "C-test",
      charm_ticks: 600,
    });
    expect(game.player.charmTicksLeft).toBe(600);
    expect(game.charms[0].available).toBe(false);
    const moveAway = createDefaultInput();
    moveAway.move = [1, 0];
    for (let tick = 0; tick < 2700; tick += 1) stepGame(game, moveAway);
    expect(game.charms[0].available).toBe(true);
  });

  it("spawns two Bóng Mực at tick 300 and activates the Night 3 wind at tick 1800", () => {
    const night1 = createGame(7, { random_motes: false, random_drifters: false, wind_enabled: false });
    let spawnEvents: ReturnType<typeof stepGame> = [];
    for (let tick = 0; tick < 300; tick += 1) {
      spawnEvents = stepGame(night1, createDefaultInput());
    }
    expect(night1.shades).toHaveLength(2);
    expect(spawnEvents.filter((event) => event.name === "shade_spawned")).toHaveLength(2);

    const night3 = createGame(7, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: true,
      motes: [],
      shades: [],
      charms: [],
    }, 3);
    for (let tick = 0; tick < 1800; tick += 1) stepGame(night3, createDefaultInput());
    expect(night3.wind.active).toBe(true);
    expect(night3.wind.activeTicksLeft).toBe(300);
  });
});
