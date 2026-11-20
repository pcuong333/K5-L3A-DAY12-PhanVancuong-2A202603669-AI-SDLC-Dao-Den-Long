# Agent instructions

- Keep gameplay rules in `src/sim`; browser rendering must consume the same simulation used by headless mode.
- Fixed simulation rate is 60 ticks/second. Preserve seeded determinism and the JSONL Test Contract.
- Before finishing, run `npm test` and `npm run build`; for contract changes, run a headless scenario too.
- In Windows PowerShell, use the `npm.cmd` shim for those commands.
- Keep contract tuning values in sync with `src/sim/config.ts` and `game.contract.json`.
- Do not claim a requirement is verified without actual test or runtime evidence.
