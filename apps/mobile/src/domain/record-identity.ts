// The one home of the row-identity validators every repository and mapper applies to a stored
// row before it is trusted: a client-generated UUID v4 and a canonical UTC ISO timestamp, as
// predicates and as Zod schemas, plus the ISO instant that may carry an offset.

import { z } from 'zod';

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return uuidV4Pattern.test(value);
}

/** True only for the exact `toISOString()` form: `2026-08-01T09:30:00.000Z`. */
export function isUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export const uuidV4Schema = z.string().refine(isUuidV4);

export const utcIsoTimestampSchema = z.string().refine(isUtcIsoTimestamp);

/** An ISO instant in any offset: a user-chosen or pulled instant, not a stored client clock. */
export const offsetIsoInstantSchema = z.iso.datetime({ offset: true });
