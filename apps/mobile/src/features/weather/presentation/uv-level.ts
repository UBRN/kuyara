export type UvLevel = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

/** The WHO band a UV index falls in, read on the whole index a reader would be told. */
export function uvLevelOf(index: number): UvLevel {
  const whole = Math.round(index);
  if (whole <= 2) return 'low';
  if (whole <= 5) return 'moderate';
  if (whole <= 7) return 'high';
  if (whole <= 10) return 'veryHigh';
  return 'extreme';
}
