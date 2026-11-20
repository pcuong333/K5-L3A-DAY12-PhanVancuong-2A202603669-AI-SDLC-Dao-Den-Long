import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardSubmission {
  name: string;
  score: number;
  nights_won: number;
  seed: number;
}

export function isValidLeaderboardName(name: string): boolean {
  return /^[A-Za-z0-9_]{3,12}$/.test(name);
}

function isValidEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string"
    && isValidLeaderboardName(entry.name)
    && Number.isSafeInteger(entry.score)
    && Number(entry.score) >= 0
    && Number.isSafeInteger(entry.nights_won)
    && Number(entry.nights_won) >= 0
    && Number(entry.nights_won) <= 3
    && typeof entry.achieved_at === "string"
    && Number.isFinite(Date.parse(entry.achieved_at))
    && typeof entry.seed === "number"
    && Number.isSafeInteger(entry.seed)
    && entry.seed >= 0;
}

function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.score - left.score || Date.parse(left.achieved_at) - Date.parse(right.achieved_at);
}

function resolveDirectory(directory?: string): string {
  return directory ?? process.env.DAO_DEN_LONG_DATA_DIR ?? join(process.cwd(), "data");
}

export function readLeaderboard(directory?: string): LeaderboardEntry[] {
  const file = join(resolveDirectory(directory), "leaderboard.json");
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read leaderboard file ${file}: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { entries?: unknown }).entries)) {
    throw new Error(`Invalid leaderboard format in ${file}`);
  }
  const entries = (parsed as { entries: unknown[] }).entries;
  if (!entries.every(isValidEntry)) throw new Error(`Invalid leaderboard entry in ${file}`);
  return [...entries].sort(compareEntries).slice(0, 10);
}

export function saveLeaderboardEntry(
  submission: LeaderboardSubmission,
  directory?: string,
  achievedAt = new Date().toISOString(),
): LeaderboardEntry[] {
  if (!isValidLeaderboardName(submission.name)) {
    throw new Error("Name must contain 3 to 12 ASCII letters, digits, or underscores.");
  }
  if (!Number.isSafeInteger(submission.score) || submission.score < 0) {
    throw new Error("Score must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(submission.nights_won) || submission.nights_won < 0 || submission.nights_won > 3) {
    throw new Error("Nights won must be an integer from 0 to 3.");
  }
  if (!Number.isSafeInteger(submission.seed) || submission.seed < 0) {
    throw new Error("Seed must be a non-negative safe integer.");
  }
  if (!Number.isFinite(Date.parse(achievedAt))) throw new Error("Achievement time must be a valid timestamp.");

  const dataDirectory = resolveDirectory(directory);
  const entry: LeaderboardEntry = { ...submission, achieved_at: new Date(achievedAt).toISOString() };
  const entries = [...readLeaderboard(dataDirectory), entry].sort(compareEntries).slice(0, 10);
  mkdirSync(dataDirectory, { recursive: true });
  const file = join(dataDirectory, "leaderboard.json");
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
  return entries;
}
