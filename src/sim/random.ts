export function nextRandom(state: number): { value: number; state: number } {
  let value = (state + 0x6d2b79f5) | 0;
  let next = Math.imul(value ^ (value >>> 15), value | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  next = (next ^ (next >>> 14)) >>> 0;
  return { value: next / 4294967296, state: (state + 0x6d2b79f5) >>> 0 };
}

export function randomDiskPoint(
  state: number,
  minRadius: number,
  maxRadius: number,
): { pos: [number, number, number]; state: number } {
  const angleResult = nextRandom(state);
  const radiusResult = nextRandom(angleResult.state);
  const angle = angleResult.value * Math.PI * 2;
  const radius = minRadius + Math.sqrt(radiusResult.value) * (maxRadius - minRadius);
  return {
    pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
    state: radiusResult.state,
  };
}
