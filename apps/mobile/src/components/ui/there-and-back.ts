/**
 * A reversing loop as one native timing of two legs: `easing` there on the first half and
 * back on the second. It equals Reanimated's reversing `withRepeat` only for a point-symmetric
 * easing such as `Easing.inOut(...)`, which every caller uses. React Native's native driver
 * cannot loop a sequence, so a loop that comes back runs one timing over both legs.
 */
export function thereAndBack(easing: (t: number) => number) {
  return (t: number) => easing(1 - Math.abs(2 * t - 1));
}
