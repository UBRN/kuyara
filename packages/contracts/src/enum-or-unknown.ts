import { z } from 'zod';

// The named unknown branch a response enum needs before the Worker may grow it. An
// installed binary reads a member it does not know as the literal 'unknown' instead of
// rejecting the whole payload, so a published Worker can add a provider or an error code
// ahead of the next binary, and every consumer maps 'unknown' deliberately. Only an
// identifier-shaped string lands there: a missing key, a number or free text is still a
// broken payload. The Worker never emits 'unknown'; its own code stays typed by the closed
// const arrays. Weather condition codes are deliberately not read this way: every mobile
// consumer of a condition is exhaustive over the closed list (icons, copy, the clothing
// rules, the SQLite CHECK constraints), and the Worker maps every upstream code onto that
// list itself, so a new condition member is a binary change on both sides.
export const unknownEnumMember = 'unknown' as const;

export function enumOrUnknown<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z.union([
    z.enum(values),
    z.string().min(1).max(32).regex(/^[a-z0-9_-]+$/).transform(() => unknownEnumMember),
  ]);
}
