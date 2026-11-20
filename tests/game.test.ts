import { describe, expect, it } from "vitest";
import { createDefaultInput, createGame, stepGame } from "../src/sim/game";

describe("Phase 1 simulation", () => {
  it("collects motes only within the configured pickup radius", () => {
    const game = createGame(12, {
      random_motes: false,
      random_shades: false,
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
      motes: [],
      shades: [],
      player: { carried: 5 },
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
    expect(game.lanterns[0].deposited).toBe(5);
    expect(game.player.carried).toBe(0);
    expect(events.map((event) => event.name)).toEqual(["deposit", "lantern_lit", "game_over"]);
  });

  it("stuns and pushes a shade when a pulse is triggered", () => {
    const game = createGame(5, {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: "S-test", pos: [2, 1, 0] }],
    });
    const input = createDefaultInput();
    input.pulse = true;

    const events = stepGame(game, input);

    expect(events.find((event) => event.name === "pulse")?.data).toEqual({ stunned_ids: ["S-test"] });
    expect(game.shades[0].state).toBe("stunned");
    expect(game.shades[0].pos[0]).toBe(5);
    expect(game.player.flames).toBe(2);
  });

  it("produces identical state and events for the same seed and inputs", () => {
    const first = createGame(987, { random_motes: false, motes: [[0, 0, 1]] });
    const second = createGame(987, { random_motes: false, motes: [[0, 0, 1]] });
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
      motes: [],
      shades: [{ pos: [1, 1, 0] }],
      player: { flames: 1 },
    });

    const events = stepGame(game, createDefaultInput());

    expect(game.status).toBe("lost");
    expect(game.reason).toBe("no_flames");
    expect(events.at(-1)?.data).toEqual({ result: "lost", reason: "no_flames" });
  });
});
