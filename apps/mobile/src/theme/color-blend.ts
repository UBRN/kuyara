function parseHex(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    throw new Error(`Expected a 6-digit hex color, received: ${hex}`);
  }

  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

export function blend(from: string, to: string, ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError(`Expected a blend ratio from 0 to 1, received: ${ratio}`);
  }

  const start = parseHex(from);
  const end = parseHex(to);
  const channel = (index: number) => Math.round(
    start[index] + (end[index] - start[index]) * ratio,
  ).toString(16).padStart(2, '0');

  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
}
