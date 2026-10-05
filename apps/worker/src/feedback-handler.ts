import {
  feedbackV1ErrorSchema, feedbackV1Path, feedbackV1RequestSchema, feedbackV1SuccessSchema,
  type FeedbackV1ErrorCode,
} from '@kuyara/contracts';

import { readRouteRequest, type RateLimiter } from './json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from './json-response.ts';

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
    const outcome = await readRouteRequest(request, {
      limiter: rateLimiter,
      scope: { keyPrefix: 'feedback', route: feedbackV1Path, limiter: 'feedback_burst' },
      schema: feedbackV1RequestSchema,
      maxBytes: maxBodyBytes,
      fatal: true,
    });
    if (outcome.kind !== 'ok') return refusalResponse(error, outcome.kind, 'unavailable');
    try {
      const { submissionId, message, appVersion, platform, locale } = outcome.data;
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
