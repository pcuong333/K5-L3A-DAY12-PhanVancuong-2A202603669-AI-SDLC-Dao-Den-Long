import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createSoakInputGenerator } from "../src/soak";

describe("Contract v1.3 soak runner", () => {
  it("generates repeatable input with direction changes every 30 ticks", () => {
    const first = createSoakInputGenerator(7);
    const second = createSoakInputGenerator(7);
    const frames = Array.from({ length: 60 }, () => first());
    const replay = Array.from({ length: 60 }, () => second());

    expect(frames).toEqual(replay);
    expect(frames.slice(1, 30).map((frame) => frame.move)).toEqual(
      Array.from({ length: 29 }, () => frames[0].move),
    );
    expect(frames[30].move).toHaveLength(2);
  });

  it("runs a night and writes the required report to stdout", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/soak.ts", "--seed", "7", "--nights", "1", "--out", "-"],
      { encoding: "utf8", timeout: 30_000 },
    );

    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(report).toMatchObject({
      nights: 1,
      crashes: 0,
      results: [expect.stringMatching(/^(won|lost)$/)],
    });
    expect(report.mem_start_mb).toEqual(expect.any(Number));
    expect(report.mem_end_mb).toEqual(expect.any(Number));
    expect(report.duration_s).toEqual(expect.any(Number));
  });
});
