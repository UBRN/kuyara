import {
  feedbackV1ErrorSchema, feedbackV1Path, feedbackV1RequestSchema, feedbackV1SuccessSchema,
  type FeedbackV1ErrorCode,
} from '@kuyara/contracts';

import {
  checkRateLimit, isJsonRequest, rateLimitedHeaders, readJsonBody, type RateLimiter,
} from './json-request.ts';
import { createErrorResponse, jsonHeaders } from './json-response.ts';

export type FeedbackDatabase = {
  prepare(sql: string): { bind(...values: string[]): { run(): Promise<unknown> } };
};

type Dependencies = Readonly<{
  database: FeedbackDatabase;
  rateLimiter: RateLimiter;
  now?: () => string;
}>;

const error = createErrorResponse<FeedbackV1ErrorCode>(feedbackV1ErrorSchema);
const maxBodyBytes = 4096;

export function createFeedbackHandler({
  database, rateLimiter, now = () => new Date().toISOString(),
}: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== feedbackV1Path) return error(404, 'not_found');
    if (request.method !== 'POST') return error(405, 'method_not_allowed', { Allow: 'POST' });
    const limit = await checkRateLimit(rateLimiter, request, {
      keyPrefix: 'feedback',
      route: feedbackV1Path,
      limiter: 'feedback_burst',
    });
    if (limit === 'unavailable') return error(503, 'unavailable');
    if (limit === 'limited') return error(429, 'rate_limited', rateLimitedHeaders);
    if (!isJsonRequest(request)) return error(400, 'invalid_request');
    const body = await readJsonBody(request.body, maxBodyBytes, { fatal: true });
    if (body === undefined) return error(400, 'invalid_request');
    const parsed = feedbackV1RequestSchema.safeParse(body);
    if (!parsed.success) return error(400, 'invalid_request');
    try {
      const { submissionId, message, appVersion, platform, locale } = parsed.data;
      // The submission id is the row id: a retry of a submission that was stored but whose
      // reply was lost hits the conflict, stores nothing and still answers success.
      await database.prepare('INSERT INTO feedback (id, message, app_version, platform, locale, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(submissionId, message, appVersion, platform, locale, now()).run();
      return Response.json(feedbackV1SuccessSchema.parse({ data: { status: 'received' } }), { headers: jsonHeaders });
    } catch {
      return error(503, 'unavailable');
    }
  };
}
