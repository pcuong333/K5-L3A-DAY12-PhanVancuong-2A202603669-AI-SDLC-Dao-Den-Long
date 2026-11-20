---
name: dao-den-long-phase2
description: Work on the Đảo Đèn Lồng Phase 2 game while preserving Test Contract v1.1 determinism and evidence.
---

# Đảo Đèn Lồng Phase 2

## Scope and architecture

- Keep all rules, timers, collisions, spawn schedules, score changes, and event emission in `src/sim`.
- The browser renderer and the headless CLI must consume the same `createGame` and `stepGame`.
- Use 60 simulation ticks per second. During pause, wall `tick` advances while `sim_tick` and simulation timers remain fixed.
- Preserve seed-driven determinism. Never use wall-clock time or `Math.random()` inside the simulation.

## Contract rules

- `game.contract.json` is the published tuning reference. Keep it synchronized with `src/sim/config.ts`.
- Accept `--night 1|2|3`; snapshots and events must follow Test Contract v1.1.
- Keep the required tick order from Ticket-02. Newly spawned entities may first interact on the following simulation tick.
- Retain the exact shade states and JSON field/event names from `docs/phase-2.md`.

## Implementation and verification

- Add focused simulation tests and at least one headless scenario fixture for every new simulation feature.
- Preserve regression tests for earlier behavior; run `npm.cmd test` and `npm.cmd run build`.
- Run deterministic headless scenarios and measure a complete 21,600-tick night against the 30-second limit.
- Measure average browser rendering at 1280×720 against the 30-FPS target. Do not claim either performance target without captured results.
- Record only real test, runtime, and performance evidence under `docs/proof/`.
