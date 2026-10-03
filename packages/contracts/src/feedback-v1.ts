import { z } from 'zod';

import { enumOrUnknown } from './enum-or-unknown.ts';

export const feedbackV1Path = '/v1/feedback' as const;
export const feedbackV1MessageMaxLength = 1000;
// The submission id is one random UUID per form submission, reused when the person retries
// the same text, so a retry after a lost reply stores the message once. It identifies a
// submission only, never a device or a person. The app version is the store version string
// (`0.MINOR.YYYYMMDD`).
export const feedbackV1AppVersionPattern = /^0\.\d{1,4}\.\d{8}$/;
export const feedbackV1RequestSchema = z.strictObject({
  submissionId: z.uuid(),
  message: z.string().trim().min(1).max(feedbackV1MessageMaxLength),
  appVersion: z.string().regex(feedbackV1AppVersionPattern),
  platform: z.enum(['ios', 'android']),
  locale: z.enum(['tr', 'en']),
});
export const feedbackV1SuccessSchema = z.object({
  data: z.object({ status: z.literal('received') }),
});
export const feedbackV1ErrorCodes = [
  'invalid_request', 'not_found', 'method_not_allowed', 'rate_limited', 'unavailable',
] as const;
export const feedbackV1ErrorSchema = z.object({
  error: z.object({ code: enumOrUnknown(feedbackV1ErrorCodes) }),
});
export type FeedbackV1Request = z.infer<typeof feedbackV1RequestSchema>;
// The closed list the Worker emits; the schema above additionally reads 'unknown'.
export type FeedbackV1ErrorCode = (typeof feedbackV1ErrorCodes)[number];
