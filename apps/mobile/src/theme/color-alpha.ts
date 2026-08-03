const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;

export function withAlpha(hexColor: string, alpha: number): string {
  const match = HEX_COLOR_PATTERN.exec(hexColor);

  if (!match) {
    throw new Error(`withAlpha expects a 6-digit hex color, received: ${hexColor}`);
  }

  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
