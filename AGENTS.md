# Agent instructions

- Keep gameplay rules in `src/sim`; browser rendering must consume the same simulation used by headless mode.
- Fixed simulation rate is 60 ticks/second. Preserve seeded determinism, wall `tick` versus `sim_tick` pause behavior, and the JSONL Test Contract v1.2.
- Before finishing, run `npm test` and `npm run build`; for contract changes, run a headless scenario too.
- In Windows PowerShell, use the `npm.cmd` shim for those commands.
- Keep contract tuning values and all three night maps in sync with `src/sim/config.ts` and `game.contract.json`.
- Follow the required tick order in Ticket-03; do not move gameplay decisions into Three.js or the DOM.
- Add at least one reproducible headless scenario for each new simulation feature and preserve Phase 1 regression coverage.
- Keep current simulation guidance in `.github/skills/dao-den-long-phase3/SKILL.md`; preserve earlier phase evidence and regression tests.
- Do not claim a requirement is verified without actual test or runtime evidence.
