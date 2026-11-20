---
name: dao-den-long-phase3
description: Work on Đảo Đèn Lồng Phase 3 while preserving deterministic Test Contract v1.2 simulation and evidence.
---

# Đảo Đèn Lồng Phase 3

## Scope and architecture

- Keep all rules, timers, collisions, spawn schedules, score changes, and event emission in `src/sim`.
- The browser renderer and headless CLI must consume the same `createGame` and `stepGame`.
- Use 60 simulation ticks per second. During pause, wall `tick` advances while `sim_tick` and simulation timers remain fixed.
- Preserve seed-driven determinism. Never use wall-clock time or `Math.random()` inside the simulation.

## Contract rules

- `game.contract.json` is the published tuning reference. Keep it synchronized with `src/sim/config.ts`.
- Accept `--night 1|2|3`; snapshots and events must follow Test Contract v1.2.
- Keep the required tick order from Ticket-03. Fuel uses integer 1/60-unit ticks; round only for output.
- A night ends at dawn or when Mây has no flames. Require `ceil(0.6 × lantern count)` lit lamps at dawn; no early win for lighting every lamp.
- Preserve Phase 1–2 regression tests except where Ticket-03 explicitly replaces behavior.

## Implementation and verification

- Add focused simulation tests and at least one reproducible headless scenario for each new simulation feature.
- Preserve old phase evidence; record only actual new test, runtime, and performance evidence under `docs/proof/`.
- Run `npm.cmd test` and `npm.cmd run build`; for contract changes, run a headless scenario too.
- Do not claim a requirement is verified without captured test or runtime results.
