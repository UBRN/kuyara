import { channelsToHex, hexChannels, isSrgbHex } from '@/domain/srgb-color';

function parseHex(hex: string): readonly number[] {
  if (!isSrgbHex(hex)) {
    throw new Error(`Expected a 6-digit hex color, received: ${hex}`);
  }

  return hexChannels(hex);
}

export function blend(from: string, to: string, ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError(`Expected a blend ratio from 0 to 1, received: ${ratio}`);
  }

  const start = parseHex(from);
  const end = parseHex(to);

  return channelsToHex(start.map((value, index) => value + (end[index] - value) * ratio));
}
