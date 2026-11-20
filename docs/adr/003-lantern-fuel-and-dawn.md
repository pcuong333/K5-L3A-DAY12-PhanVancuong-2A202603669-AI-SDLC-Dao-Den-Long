# ADR 003: Lantern fuel and dawn-based completion

## Status

Accepted for Test Contract v1.2.

## Context

Under the previous rule, lighting every lantern ended a night early. Playtests showed that this removed the end-of-night survival challenge. Ticket-03 replaces that rule: lanterns can go out, and Mây must preserve a minimum number of lit lamps until dawn.

## Decision

- Store fuel as integer `fuelUnits`, where 60 units equal one displayed fuel unit. Natural burn removes one unit per simulation tick; each draining Shade removes five. Round only when formatting contract output.
- Keep `everLit` and `relitCount` independently from current `lit`, `fuelUnits`, and `deposited`. Extinguishing clears fuel/deposited but preserves lighting history.
- Treat lamps below 30 fuel as weak and outside safe zones. Only wandering Shades select a target; they prefer the nearest weak lit lamp and otherwise target the nearest unlit lamp. A Shade within 2 m (XZ) drains it, and nearby players, pulses, relighting, or extinguishing transition the Shade out of `drain`.
- Evaluate the night result after all simulation updates in the final tick. Zero flames takes precedence; otherwise, dawn is a win only when the lit-lamp count is at least `ceil(0.6 × total lamps)`.
- Count first lights and relights during the current night for capacity growth. Scenario-initialized lamps do not contribute.

## Consequences

- Lighting a lamp no longer ends a night. Fuel, drain behavior, safe-zone state, scoring, snapshots, and scenario parsing must stay deterministic across browser and headless execution.
- Integer fuel avoids accumulating floating-point drift during long runs and stacked Shade drains.
- The old immediate `all_lit` outcome and score formula are intentionally incompatible with v1.2. Regression tests are updated only where those rules were replaced; other Phase 1–2 coverage remains active.
