# Phase 4 — Ticket-04 “Bình minh: phát hành v1.0.0”

## Contract v1.3 and implementation

- Preserved the fixed-step simulation and JSONL headless CLI; the browser benchmark uses the same `createGame` state definitions and browser rendering.
- Added `bench_cmd` and `soak_cmd` to `game.contract.json`.
- Added a reproducible 1280×720 benchmark scene: Night 1, player at `(0,0,0)`, 200 wandering Shades, 100 motes, L1–L3 lit with 100 fuel, no random spawns or simulation progression. It warms up for 3 seconds, samples for the requested duration, orbits the camera once every 15 seconds, requests Chromium frame-limit/VSync flags, and records FPS, 1%-low FPS, p95 frame time, frame count, load time, renderer, OS, and viewport. Browser-process peak RSS is `null` because the runner cannot sample it portably.
- Added a ten-night one-process soak runner. It cycles Nights 1–3, defaults to seeds 7 through 16, changes movement every 30 ticks, and generates independent jump/dash/pulse/interact inputs at the specified probabilities.
- Added an atomic JSON leaderboard file under `data/` (or `DAO_DEN_LONG_DATA_DIR`), strict ASCII names, score/time ordering, top-ten retention, in-game result/menu screens, and `npm start -- --export-leaderboard out.json`.
- Added persistent rebinds for nine actions, duplicate-key feedback, default restoration, low-fuel/wind/countdown/spawn indicators, reduced motion, and 1.25× text. HUD, menu and settings text use a minimum 18px size at the standard viewport.
- Added a small Node HTTP server to support the same-origin leaderboard in both development and production. Clean setup is `npm install`, `npm run build`, `npm start`.
- Added `npm run record-demo`, which captures the live browser game with reproducible keyboard/mouse input and encodes a short MP4 with FFmpeg.

## Verification evidence

All statements below describe runs performed against this worktree; benchmark values are hardware-specific.

| Requirement | Evidence | Result |
|---|---|---|
| Deterministic benchmark fixture | `tests/phase4-benchmark.test.ts` | Exact requested counts, lamp fuel and seed repeatability tested |
| 10-night soak | [soak.json](../soak.json) | 10/10 nights completed, 0 crashes; RSS 62.5→70.1 MB (1.12×), 0.1 s; memory criterion passes |
| 30-second browser benchmark | [bench.json](../bench.json) | 1280×720 windowed, Edge/ANGLE Radeon 610M, Windows; average 38.03 FPS, 1%-low 2.99 FPS, p95 212.4 ms, 1141 frames, load 0.56 s; load threshold passes, both local FPS thresholds fail |
| Benchmark scene appearance | [phase-4-gameplay.png](proof/phase-4-gameplay.png) | Captured from the benchmark browser scene at 1280×720 |
| Gameplay demo video | [phase-4.mp4](demo/phase-4.mp4) | H.264, 1280×720, 15 fps, 44.8 seconds; real browser game with scripted inputs; no audio |
| Score validation and sorting | `tests/phase4-leaderboard.test.ts` | Name constraints, persistence, rank order and top-ten cap tested |
| API save/reject/export | Development server smoke test | GET returned empty list; valid POST persisted; invalid Unicode name returned HTTP 400; CLI export returned the saved entry |
| Interactive accessibility UI | Development browser smoke test | Settings listed all nine actions; binding W to Jump reported the Up-key conflict; restoring defaults worked; empty leaderboard state rendered |
| Full contract/regression | `npm.cmd test`, `npm.cmd run build`, headless run | 45 tests across 8 files passed; strict TypeScript/Vite production build passed (existing >500 kB chunk warning); 600-tick Night 3 headless run ended in `playing` |

## Assumptions and limitations

- Leaderboard storage is local to the machine running the server; it is not a shared online ranking service.
- Browser benchmark asks Chromium/Edge to disable frame limiting and GPU VSync. The report states the requested flags; the browser/driver does not expose a portable confirmation that scan-out synchronization was actually disabled.
- Portable peak RSS sampling for a browser process is unavailable in this runner, so the benchmark emits `null` with an explanation.
- The 44.8-second Phase 4 video is a real browser session driven by the reproducible recorder, not a user-played run; it shows gameplay and accessibility settings but does not include captured audio or a terminal test/benchmark walkthrough.
- GitHub tag/release/push actions are not part of this local implementation and have not been performed.

## AI use and retrospective

Used Copilot SDK in VS Code to inspect the existing contract and implement focused simulation-adjacent tooling, accessibility UI, local persistence, and validation. The task was split into benchmark/soak, leaderboard, and accessibility increments; scenario and API checks were run before broad documentation updates. The full Phase 1–3 simulation rules were not moved into the browser.

The local usage store records a session-level snapshot across turns 0–17: 622 API calls, 80,470,910 input tokens, 555,191 output tokens, 78,511,427 cache-read tokens, and 130,700,452,000 nano-AIU. This session may include earlier project-phase work, so these numbers are not a Phase-4-only estimate; nano-AIU is not USD and is not presented as a monetary cost. For precise future phase accounting, capture the provider usage summary at each phase boundary. Main trade-offs: local leaderboard avoids a service/account dependency; the benchmark reports unknown RSS instead of inventing it; browser flags are reported as requests rather than verified GPU-driver state. Performance thresholds must be checked on the instructor machine; the captured local report is the evidence for this machine only.
