import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isValidLeaderboardName, readLeaderboard, saveLeaderboardEntry } from "../src/leaderboard";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dao-den-long-leaderboard-"));
  directories.push(directory);
  return directory;
}

describe("Contract v1.3 leaderboard", () => {
  it("accepts only 3–12 ASCII letters, digits, or underscores", () => {
    expect(isValidLeaderboardName("MAY_2026")).toBe(true);
    expect(isValidLeaderboardName("ab")).toBe(false);
    expect(isValidLeaderboardName("Mây")).toBe(false);
    expect(isValidLeaderboardName("too_many_chars_123")).toBe(false);
  });

  it("persists the top ten in score order and breaks ties by earlier achievement", () => {
    const directory = createDirectory();
    saveLeaderboardEntry(
      { name: "First", score: 100, nights_won: 1, seed: 7 },
      directory,
      "2026-01-01T00:00:00.000Z",
    );
    saveLeaderboardEntry(
      { name: "Later", score: 100, nights_won: 2, seed: 8 },
      directory,
      "2026-01-02T00:00:00.000Z",
    );
    expect(readLeaderboard(directory).map((entry) => entry.name)).toEqual(["First", "Later"]);
    for (let index = 0; index < 10; index += 1) {
      saveLeaderboardEntry(
        { name: `Top${index}`, score: 200 + index, nights_won: 3, seed: 100 + index },
        directory,
        `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      );
    }

    const entries = readLeaderboard(directory);
    expect(entries).toHaveLength(10);
    expect(entries[0].score).toBe(209);
    expect(entries).toEqual([...entries].sort((left, right) =>
      right.score - left.score || Date.parse(left.achieved_at) - Date.parse(right.achieved_at),
    ));
  });

  it("rejects invalid submissions without writing them", () => {
    const directory = createDirectory();

    expect(() => saveLeaderboardEntry(
      { name: "x", score: 1, nights_won: 0, seed: 7 },
      directory,
    )).toThrow(/Name must contain/);
    expect(readLeaderboard(directory)).toEqual([]);
  });
});
