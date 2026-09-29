import { z } from 'zod';

const offsetDatetime = z.iso.datetime({ offset: true });
const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A server arrival instant in one sortable form: UTC, six fractional digits (Postgres keeps
 * microseconds, which `Date` cannot). Two canonical values compare correctly as text, so the
 * pull cursor never passes through a millisecond `Date` that could skip or repeat a row.
 */
export function canonicalServerInstant(value: unknown): string | null {
  const parsed = offsetDatetime.safeParse(value);
  const match = parsed.success ? parts.exec(parsed.data) : null;
  if (!match) return null;
  const [, whole, fraction = '', offset] = match;
  const milliseconds = Date.parse(`${whole}${offset}`);
  if (!Number.isFinite(milliseconds)) return null;
  return `${new Date(milliseconds).toISOString().slice(0, 19)}.${fraction.slice(0, 6).padEnd(6, '0')}Z`;
}
