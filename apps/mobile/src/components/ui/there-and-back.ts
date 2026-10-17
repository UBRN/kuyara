/**
 * A reversing loop as one native timing of two legs: `easing` there on the first half and
 * back on the second, as Reanimated's reversing `withRepeat` plays it. React Native's native
 * driver cannot loop a sequence, so a loop that comes back runs one timing over both legs.
 */
export function thereAndBack(easing: (t: number) => number) {
  return (t: number) => easing(1 - Math.abs(2 * t - 1));
}
