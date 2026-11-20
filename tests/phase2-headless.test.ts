import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

interface JsonLine {
  type: "snapshot" | "event" | "end";
  [key: string]: unknown;
}

function runHeadless(
  night: number,
  ticks: number,
  scenario: string,
  inputs: string,
  snapshotEvery = 1,
): JsonLine[] {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/headless.ts",
      "--seed",
      "17",
      "--night",
      String(night),
      "--ticks",
      String(ticks),
      "--scenario",
      `tests/fixtures/${scenario}`,
      "--inputs",
      `tests/fixtures/${inputs}`,
      "--out",
      "-",
      "--snapshot-every",
      String(snapshotEvery),
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonLine);
}

describe("Test Contract v1.1 headless scenarios", () => {
  it("emits dash and pause/resume events while simulation time freezes", () => {
    const lines = runHeadless(
      1,
      4,
      "phase2-dash-pause-scenario.json",
      "phase2-dash-pause-inputs.json",
    );
    const events = lines.filter((line) => line.type === "event");
    const snapshots = lines.filter((line) => line.type === "snapshot");
    expect(events.map((event) => event.name)).toEqual(["night_start", "dash", "paused", "resumed"]);
    expect(snapshots.find((snapshot) => snapshot.tick === 2)).toMatchObject({
      tick: 2,
      sim_tick: 1,
      state: "paused",
    });
    expect(snapshots.at(-1)).toMatchObject({ tick: 4, sim_tick: 2, state: "playing" });
    expect((snapshots[1].player as Record<string, unknown>).vel).toEqual([0, 0, 14]);
  });

  it("reports drifter theft and pulse recovery through JSONL events", () => {
    const lines = runHeadless(2, 2, "phase2-drifter-scenario.json", "phase2-drifter-inputs.json");
    const events = lines.filter((line) => line.type === "event");
    expect(events.find((event) => event.name === "drifter_steal")?.data).toEqual({
      drifter_id: "D1",
      amount: 3,
      carried: 3,
    });
    expect(events.find((event) => event.name === "drifter_drop")?.data).toEqual({
      drifter_id: "D1",
      amount: 3,
    });
    const finalSnapshot = lines.filter((line) => line.type === "snapshot").at(-1);
    expect((finalSnapshot?.motes as Array<Record<string, unknown>>)[0].kind).toBe("dropped");
  });

  it("reports charms and fall recovery state in snapshots and events", () => {
    const charmLines = runHeadless(2, 1, "phase2-charm-scenario.json", "phase2-empty-inputs.json");
    const charmEvent = charmLines.find((line) => line.type === "event" && line.name === "charm_picked");
    expect(charmEvent?.data).toEqual({ charm_id: "C1", charm_ticks: 600 });
    expect(charmLines.filter((line) => line.type === "snapshot").at(-1)?.charms).toEqual([
      { id: "C1", available: false, respawn_s: 45 },
    ]);

    const fallLines = runHeadless(1, 1, "phase2-fall-scenario.json", "phase2-empty-inputs.json");
    expect(fallLines.find((line) => line.type === "event" && line.name === "player_hit")?.data).toEqual({
      by: "fall",
      flames: 1,
      lost: 4,
    });
  });

  it("runs a complete Night 3 interval with wind and the extended snapshot shape", () => {
    const lines = runHeadless(3, 1800, "phase2-empty-scenario.json", "phase2-empty-inputs.json", 1800);
    const snapshots = lines.filter((line) => line.type === "snapshot");
    expect(snapshots[0]).toMatchObject({
      night: 3,
      sim_tick: 0,
      wind: { active: false },
      player: { grounded: true, pos: [0, 6, 5] },
    });
    expect(snapshots.at(-1)).toMatchObject({
      night: 3,
      tick: 1800,
      sim_tick: 1800,
      wind: { active: true, dir_deg: expect.any(Number) },
    });
  });

  it("uses the Night 2 and Night 3 spring pads through headless scenarios", () => {
    const night2 = runHeadless(2, 1, "phase2-night2-spring-scenario.json", "phase2-empty-inputs.json");
    const night3 = runHeadless(3, 1, "phase2-night3-spring-scenario.json", "phase2-empty-inputs.json");
    expect(night2.find((line) => line.type === "event" && line.name === "spring_launched")).toBeDefined();
    expect(night3.find((line) => line.type === "event" && line.name === "spring_launched")).toBeDefined();
    expect((night2.filter((line) => line.type === "snapshot").at(-1)?.player as { vel: number[] }).vel[1]).toBe(14);
    expect((night3.filter((line) => line.type === "snapshot").at(-1)?.player as { vel: number[] }).vel[1]).toBe(12);
  });

  it("spawns the standardized opening motes and Night 1 Bóng Mực on schedule", () => {
    const lines = runHeadless(1, 300, "phase2-default-scenario.json", "phase2-empty-inputs.json", 300);
    const snapshots = lines.filter((line) => line.type === "snapshot");
    expect(snapshots[0].motes_active).toBe(20);
    expect(snapshots.at(-1)?.motes_active).toBe(21);
    expect((snapshots.at(-1)?.shades as unknown[])).toHaveLength(2);
    expect(lines.filter((line) => line.type === "event" && line.name === "shade_spawned")).toHaveLength(2);
  });

  it("simulates the full six-minute Night 3 contract", () => {
    const lines = runHeadless(3, 21_600, "phase2-full-night-scenario.json", "phase2-empty-inputs.json", 21_600);
    expect(lines.at(-1)).toMatchObject({ type: "end", ticks: 21_600, state: "lost" });
  });
});
