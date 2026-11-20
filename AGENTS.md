# Agent instructions

- Keep gameplay rules in `src/sim`; browser rendering must consume the same simulation used by headless mode.
- Fixed simulation rate is 60 ticks/second. Preserve seeded determinism, wall `tick` versus `sim_tick` pause behavior, and the JSONL Test Contract v1.1.
- Before finishing, run `npm test` and `npm run build`; for contract changes, run a headless scenario too.
- In Windows PowerShell, use the `npm.cmd` shim for those commands.
- Keep contract tuning values and all three night maps in sync with `src/sim/config.ts` and `game.contract.json`.
- Follow the required tick order in Ticket-02; do not move gameplay decisions into Three.js or the DOM.
- Add at least one reproducible headless scenario for each new simulation feature and preserve Phase 1 regression coverage.
- Update `.github/skills/dao-den-long-phase2/SKILL.md` when simulation/contract guidance changes.
- Do not claim a requirement is verified without actual test or runtime evidence.
