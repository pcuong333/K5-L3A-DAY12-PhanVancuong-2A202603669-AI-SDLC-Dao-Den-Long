import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

interface JsonLine {
  type: "snapshot" | "event" | "end";
  [key: string]: unknown;
}

function runHeadless(scenario: string, ticks = 1, inputs = "win-inputs.json") {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/headless.ts",
      "--seed",
      "17",
      "--night",
      "1",
      "--ticks",
      String(ticks),
      "--scenario",
      `tests/fixtures/${scenario}`,
      "--inputs",
      `tests/fixtures/${inputs}`,
      "--out",
      "-",
      "--snapshot-every",
      "1",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
  );
}

describe("Test Contract v1.2 headless scenarios", () => {
  it("emits fuel, lighting history, dynamic capacity, and dawn results", () => {
    const result = runHeadless("win-scenario.json");
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonLine);
    const snapshots = lines.filter((line) => line.type === "snapshot");
    const events = lines.filter((line) => line.type === "event");

    expect(snapshots[0].lanterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "L1", lit: false, fuel: 0, ever_lit: false, relit_count: 0 }),
      expect.objectContaining({ id: "L2", lit: true, fuel: 100, ever_lit: true }),
    ]));
    expect(snapshots.at(-1)?.player).toMatchObject({ carried: 0, capacity: 12 });
    expect(snapshots.at(-1)?.lanterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "L1", lit: true, ever_lit: true, relit_count: 0 }),
    ]));
    expect(events.find((event) => event.name === "lantern_lit")?.data).toEqual({
      lantern_id: "L1",
      relight: false,
    });
    expect(events.find((event) => event.name === "game_over")?.data).toEqual({
      result: "won",
      reason: "dawn_survived",
    });
    expect(lines.at(-1)).toMatchObject({ type: "end", ticks: 1, state: "won", score: 1045 });
  });

  it("rejects out-of-range fuel and unknown Shade target lanterns", () => {
    const invalidFuel = runHeadless("phase3-invalid-fuel-scenario.json");
    expect(invalidFuel.status).toBe(2);
    expect(invalidFuel.stderr).toContain("fuel must be in [0, 100]");

    const invalidTarget = runHeadless("phase3-invalid-target-scenario.json");
    expect(invalidTarget.status).toBe(2);
    expect(invalidTarget.stderr).toContain("Unknown target lantern id");
  });

  it("reports Shade fuel drain events and snapshot values", () => {
    const result = runHeadless("phase3-drain-scenario.json", 60, "phase2-empty-inputs.json");
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonLine);
    const drainEvent = lines.find((line) => line.type === "event" && line.name === "fuel_drain");
    const finalSnapshot = lines.filter((line) => line.type === "snapshot").at(-1);

    expect(drainEvent?.data).toEqual({ lantern_id: "L1", shade_id: "S1", fuel: 23 });
    expect(finalSnapshot?.lanterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "L1", lit: true, fuel: 23, ever_lit: true, relit_count: 0 }),
    ]));
    expect(finalSnapshot?.shades).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "S1", state: "drain", target_lantern_id: "L1" }),
    ]));
  });
});
