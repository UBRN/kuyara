import { z } from 'zod';

import { enumOrUnknown } from './enum-or-unknown.ts';

export const accountDeleteV1Path = '/v1/account/delete' as const;

// The Supabase access token travels only in the Authorization header, and the user id comes
// from that token's `sub`, so neither has a key here. The code is Apple's single-use
// authorization code, present only when the account has an Apple identity.
export const accountDeleteV1RequestSchema = z.strictObject({
  appleAuthorizationCode: z.string().min(1).max(1024).optional(),
});

export const accountDeleteV1SuccessSchema = z.object({
  data: z.object({
    status: z.literal('deleted'),
  }),
});

export const accountDeleteV1ErrorCodes = [
  'invalid_request', 'not_found', 'method_not_allowed', 'unauthorized',
  'apple_code_invalid', 'rate_limited', 'unavailable', 'internal_error',
] as const;

export const accountDeleteV1ErrorSchema = z.object({
  error: z.object({
    code: enumOrUnknown(accountDeleteV1ErrorCodes),
  }),
});

export type AccountDeleteV1Request = z.infer<typeof accountDeleteV1RequestSchema>;
// The closed list the Worker emits; the schema above additionally reads 'unknown'.
export type AccountDeleteV1ErrorCode = (typeof accountDeleteV1ErrorCodes)[number];
