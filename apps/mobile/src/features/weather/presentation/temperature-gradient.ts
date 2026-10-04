import { temperatureScalePosition } from '@/features/weather/domain/temperature-scale';
import { mixOklch } from '@/theme/color-oklch';
import type { TemperatureRamp } from '@/theme/theme';

/** One SVG gradient stop: its place along the gradient, 0 to 1, and its colour. */
export type TemperatureGradientStop = Readonly<{ offset: number; color: string }>;

/** A temperature's colour on the ramp, looked up by its Celsius value alone. */
export function temperatureColor(ramp: TemperatureRamp, celsius: number): string {
  const position = temperatureScalePosition(celsius);
  const index = Math.min(Math.floor(position), ramp.length - 2);
  return mixOklch(ramp[index], ramp[index + 1], position - index);
}

/**
 * The stops of a gradient that runs from one temperature to another: both ends and every
 * whole degree between them, each at its own place. A daily capsule runs from its low to its
 * high; the hourly line's vertical axis runs from its maximum at the top to its minimum. A
 * gradient with no span is one colour, and so is a single stop.
 */
export function temperatureStops(
  ramp: TemperatureRamp,
  from: number,
  to: number,
): readonly TemperatureGradientStop[] {
  const span = to - from;
  if (span === 0) return [{ offset: 0, color: temperatureColor(ramp, from) }];
  const step = Math.sign(span);
  const temperatures = [from];
  for (let whole = step > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1; (to - whole) * step > 0; whole += step) {
    temperatures.push(whole);
  }
  temperatures.push(to);
  return temperatures.map((celsius) => ({
    offset: celsius === from ? 0 : (celsius - from) / span,
    color: temperatureColor(ramp, celsius),
  }));
}
