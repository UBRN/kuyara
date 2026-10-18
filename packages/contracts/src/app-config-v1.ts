import { z } from 'zod';

import { enumOrUnknown } from './enum-or-unknown.ts';

// Remote app configuration (ADR 0042 section 7). Installed binaries read this body for as long
// as they live, so it only ever gains a field, and each switch reads a value it does not know
// as 'unknown', which the app treats as on.
export const appConfigV1Path = '/v1/app-config' as const;
export const appConfigV1SiriCardValues = ['on', 'off'] as const;
export const appConfigV1SuccessSchema = z.object({
  data: z.object({ siriCard: enumOrUnknown(appConfigV1SiriCardValues) }),
});
export const appConfigV1ErrorCodes = ['method_not_allowed', 'unavailable'] as const;
export const appConfigV1ErrorSchema = z.object({
  error: z.object({ code: enumOrUnknown(appConfigV1ErrorCodes) }),
});
// The closed lists the Worker emits; the schemas above additionally read 'unknown'.
export type AppConfigV1SiriCard = (typeof appConfigV1SiriCardValues)[number];
export type AppConfigV1ErrorCode = (typeof appConfigV1ErrorCodes)[number];
