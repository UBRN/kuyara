import { offsetIsoInstantSchema } from '@/domain/record-identity';

const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A server arrival instant in one sortable form: UTC, six fractional digits (Postgres keeps
 * microseconds, which `Date` cannot). Two canonical values compare correctly as text, so the
 * pull cursor never passes through a millisecond `Date` that could skip or repeat a row.
 */
export function canonicalServerInstant(value: unknown): string | null {
  const parsed = offsetIsoInstantSchema.safeParse(value);
  const match = parsed.success ? parts.exec(parsed.data) : null;
  if (!match) return null;
  const [, whole, fraction = '', offset] = match;
  const milliseconds = Date.parse(`${whole}${offset}`);
  if (!Number.isFinite(milliseconds)) return null;
  return `${new Date(milliseconds).toISOString().slice(0, 19)}.${fraction.slice(0, 6).padEnd(6, '0')}Z`;
}

/**
 * A canonical server instant moved back by whole `seconds`, still canonical: the fractional
 * digits are kept as they are, so the result compares correctly as text with other instants.
 */
export function serverInstantSecondsBefore(instant: string, seconds: number): string | null {
  const canonical = canonicalServerInstant(instant);
  if (canonical === null) return null;
  const whole = Date.parse(`${canonical.slice(0, 19)}Z`) - seconds * 1000;
  return `${new Date(whole).toISOString().slice(0, 19)}${canonical.slice(19)}`;
}
