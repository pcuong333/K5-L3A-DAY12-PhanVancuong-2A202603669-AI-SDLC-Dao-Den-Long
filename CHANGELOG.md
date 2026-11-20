# Changelog

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
