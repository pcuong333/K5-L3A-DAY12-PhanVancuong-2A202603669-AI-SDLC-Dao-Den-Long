# Changelog

## Phase 1 — playable prototype (Test Contract v1.0)

- Added the original 3D island scene, Mây movement and jumping, lantern/mote collection, Shade encounters, pulse, score, and the first browser HUD.
- Established the deterministic 60 Hz simulation and JSONL headless runner with seeded scenarios and regression tests.

## Phase 2 — three islands (Test Contract v1.1)

- Added three distinct night maps, dash, wind and charms, drifters, pause/resume, the three-night menu/results flow, synthesized audio, and persisted volume/camera settings.
- Extended the shared simulation and headless contract while retaining Phase 1 regressions.

## Phase 3 — lantern fuel (Test Contract v1.2)

- Added integer-tick lantern fuel, refueling/relighting, Shade fuel drain, dawn survival, dynamic carrying capacity, updated scoring, and a persisted color-vision setting.
- Preserved the headless simulation contract and its Phase 1–2 regressions.

## Phase 4 — release readiness (Test Contract v1.3)

- Added a deterministic browser benchmark runner and ten-night deterministic soak runner; the benchmark scene contains 200 wandering Shades, 100 motes, and three fully fueled lamps.
- Added local disk-backed leaderboard submission, top-ten ranking, and JSON export through the same-origin server.
- Added persistent key rebinding with duplicate detection/default restoration, large text, reduced motion, and HUD indicators for spawning Shades, wind, the final ten seconds, and low fuel.
- Raised minimum HUD and settings text to 18 px and documented clean install, production launch, tests, headless, benchmark, soak, credits, and rights.
- Added a reproducible browser demo recorder; captured `docs/demo/phase-4.mp4` from a 44.8-second live browser session.

## Historical Phase 3 notes

## Phase 3 — Test Contract v1.2

### Breaking changes

- A night no longer ends when all lanterns are lit. Each night lasts 240, 270, or 300 seconds; Mây wins only by surviving to dawn with at least `ceil(0.6 × lantern count)` lamps still lit.
- Lit lanterns now start with 100 fuel, lose 1 fuel/second, can go out, and must be relit for 5 motes. Fuel, `ever_lit`, and `relit_count` are part of the scenario and snapshot contract.
- Shade states now include `drain`; Shades can drain weak lamps, and headless scenarios may specify a drain target.
- Carry capacity now grows by 2 per successful first light or relight, up to 20, and resets at the start of each night.
- The old score formula is replaced: +5 per mote spent on a lantern, +100 per first light, +40 per relight, +5 per Shade hit by a pulse (+15 if it was draining), and at a successful dawn +50 plus `floor(fuel)` per lit lamp and +50 per remaining flame. There is no time bonus.
- Headless snapshots add lamp fuel/history and player capacity; events add `refuel`, `lantern_out`, and `fuel_drain`, while `lantern_lit` includes `relight`. The former `all_lit` ending reason is removed.

### Added

- A persisted “Bảng màu dễ phân biệt” setting changes Shade accents and warning presentation without relying on color alone.
- Low-fuel lanterns show a blinking fuel bar; extinguished lanterns are visually distinct by shape.
