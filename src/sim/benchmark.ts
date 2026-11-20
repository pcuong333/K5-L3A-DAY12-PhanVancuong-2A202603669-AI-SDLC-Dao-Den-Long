import { randomDiskPoint } from "./random";
import type { Scenario } from "./types";

export function createBenchmarkScenario(seed: number): Scenario {
  let state = seed >>> 0;
  const positions = (count: number, minRadius: number, maxRadius: number): [number, number, number][] => {
    const result: [number, number, number][] = [];
    for (let index = 0; index < count; index += 1) {
      const point = randomDiskPoint(state, minRadius, maxRadius);
      state = point.state;
      result.push(point.pos);
    }
    return result;
  };

  return {
    player: { pos: [0, 0, 0], flames: 3, invuln_ticks: Number.MAX_SAFE_INTEGER },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    motes: positions(100, 5, 42),
    shades: positions(200, 8, 42).map((pos) => ({ pos, state: "wander" })),
    charms: [],
    lanterns: [
      { id: "L1", lit: true, fuel: 100 },
      { id: "L2", lit: true, fuel: 100 },
      { id: "L3", lit: true, fuel: 100 },
    ],
  };
}
