import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEY_BINDINGS,
  findKeyBindingConflict,
  parseKeyBindings,
} from "../src/accessibility";

describe("Contract v1.3 accessibility controls", () => {
  it("loads persisted bindings and reports duplicate primary or alias keys", () => {
    const saved = { ...DEFAULT_KEY_BINDINGS, jump: "KeyJ" };
    expect(parseKeyBindings(JSON.stringify(saved))).toEqual({ bindings: saved });

    const duplicate = { ...DEFAULT_KEY_BINDINGS, jump: "KeyW" };
    expect(parseKeyBindings(JSON.stringify(duplicate)).warning).toContain("Phím trùng");
    expect(parseKeyBindings(JSON.stringify({ ...DEFAULT_KEY_BINDINGS, jump: "ArrowUp" })).warning)
      .toContain("Phím trùng");
  });

  it("identifies conflicting actions while allowing the same action's aliases", () => {
    expect(findKeyBindingConflict(DEFAULT_KEY_BINDINGS, "jump", "KeyW")).toBe("up");
    expect(findKeyBindingConflict(DEFAULT_KEY_BINDINGS, "up", "ArrowUp")).toBeUndefined();
  });
});
