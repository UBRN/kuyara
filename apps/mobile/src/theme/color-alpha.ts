import { hexChannels, isSrgbHex } from '@/domain/srgb-color';

export function withAlpha(hexColor: string, alpha: number): string {
  if (!isSrgbHex(hexColor)) {
    throw new Error(`withAlpha expects a 6-digit hex color, received: ${hexColor}`);
  }

  const [r, g, b] = hexChannels(hexColor);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
