import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';

// ADR 0034 section 6: the only description of the native surface anywhere in the app.
// Structured JSON goes in and structured JSON comes out; prose never crosses the boundary.
// No recommendation path calls `selectOutfits` (ADR 0034 section 1); the app reads only the
// availability answer, for the performance telemetry attribute.
export type OnDeviceAiModule = Readonly<{
  getAvailability(): Promise<OnDeviceAiAvailability>;
  selectOutfits(
    input: string,
    options: Readonly<{ timeoutMs: number }>,
  ): Promise<string>;
}>;

const availabilityReadMilliseconds = 8000;

const unknown: OnDeviceAiAvailability = { status: 'unavailable', reason: 'unknown' };

/**
 * What the device reports about Foundation Models. No inference, no quota, no measurable
 * time: this is not a probe. It is still a call into a native module, so it is bounded, and a
 * read that throws or never settles answers `unknown`.
 */
export async function readOnDeviceAiAvailability(
  module: OnDeviceAiModule | null,
  timeoutMilliseconds: number = availabilityReadMilliseconds,
): Promise<OnDeviceAiAvailability> {
  if (!module) return { status: 'unavailable', reason: 'device_not_eligible' };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<OnDeviceAiAvailability>((resolve) => {
    timeoutId = setTimeout(() => resolve(unknown), timeoutMilliseconds);
  });
  try {
    return await Promise.race([module.getAvailability().catch(() => unknown), bound]);
  } finally {
    clearTimeout(timeoutId);
  }
}
