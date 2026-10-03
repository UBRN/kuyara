import {
  feedbackV1ErrorSchema, feedbackV1Path, feedbackV1RequestSchema, feedbackV1SuccessSchema,
  type FeedbackV1ErrorCode,
} from '@kuyara/contracts';

import { createErrorResponse, jsonHeaders } from './json-response.ts';

export type FeedbackDatabase = {
  prepare(sql: string): { bind(...values: string[]): { run(): Promise<unknown> } };
};

type Dependencies = Readonly<{
  database: FeedbackDatabase;
  rateLimiter: { limit(input: { key: string }): Promise<{ success: boolean }> };
  now?: () => string;
}>;

const error = createErrorResponse<FeedbackV1ErrorCode>(feedbackV1ErrorSchema);
const maxBodyBytes = 4096;

async function boundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    reader.releaseLock();
  }
}

export function createFeedbackHandler({
  database, rateLimiter, now = () => new Date().toISOString(),
}: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== feedbackV1Path) return error(404, 'not_found');
    if (request.method !== 'POST') return error(405, 'method_not_allowed', { Allow: 'POST' });
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      if (!(await rateLimiter.limit({ key: `feedback:${ip}` })).success) {
        return error(429, 'rate_limited', { 'Retry-After': '60' });
      }
    } catch {
      return error(503, 'unavailable');
    }
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return error(400, 'invalid_request');
    }
    let body: unknown;
    try {
      const text = await boundedBody(request);
      if (text === null) return error(400, 'invalid_request');
      body = JSON.parse(text);
    } catch {
      return error(400, 'invalid_request');
    }
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
