export const KEY_ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "jump",
  "dash",
  "interact",
  "pulse",
  "pause",
] as const;

export type KeyAction = typeof KEY_ACTIONS[number];
export type KeyBindings = Record<KeyAction, string>;

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  up: "Di chuyển lên",
  down: "Di chuyển xuống",
  left: "Di chuyển trái",
  right: "Di chuyển phải",
  jump: "Nhảy",
  dash: "Lướt",
  interact: "Tương tác",
  pulse: "Tỏa sáng",
  pause: "Tạm dừng",
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  dash: "ShiftLeft",
  interact: "KeyE",
  pulse: "KeyQ",
  pause: "Escape",
};

export const KEY_ALIASES: Partial<Record<KeyAction, readonly string[]>> = {
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  dash: ["ShiftRight"],
  pause: ["KeyP"],
};

export function findKeyBindingConflict(
  bindings: KeyBindings,
  action: KeyAction,
  key: string,
): KeyAction | undefined {
  return KEY_ACTIONS.find((candidate) =>
    candidate !== action
    && (bindings[candidate] === key || KEY_ALIASES[candidate]?.includes(key) === true),
  );
}

export function parseKeyBindings(raw: string | null): { bindings: KeyBindings; warning?: string } {
  if (raw === null) return { bindings: { ...DEFAULT_KEY_BINDINGS } };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { bindings: { ...DEFAULT_KEY_BINDINGS }, warning: "Phím đã lưu không hợp lệ; đã khôi phục mặc định." };
  }
  if (!value || typeof value !== "object") {
    return { bindings: { ...DEFAULT_KEY_BINDINGS }, warning: "Phím đã lưu không hợp lệ; đã khôi phục mặc định." };
  }
  const candidate = value as Record<string, unknown>;
  const bindings = { ...DEFAULT_KEY_BINDINGS };
  for (const action of KEY_ACTIONS) {
    const key = candidate[action];
    if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(key)) {
      return { bindings: { ...DEFAULT_KEY_BINDINGS }, warning: "Phím đã lưu không hợp lệ; đã khôi phục mặc định." };
    }
    bindings[action] = key;
  }
  for (const action of KEY_ACTIONS) {
    const conflict = findKeyBindingConflict(bindings, action, bindings[action]);
    if (conflict) {
      return {
        bindings: { ...DEFAULT_KEY_BINDINGS },
        warning: `Phím trùng giữa ${KEY_ACTION_LABELS[action]} và ${KEY_ACTION_LABELS[conflict]}; đã khôi phục mặc định.`,
      };
    }
  }
  return { bindings };
}

export function formatKeyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Shift")) return "Shift";
  if (code === "Escape") return "Esc";
  return code;
}
