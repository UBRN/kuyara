import {
  accountDeleteV1Path,
  aiProbeV1Path,
  aiReadyV1Path,
  aiReadyV1SuccessSchema,
  aiRecommendV1Path,
  aiRecommendV2Path,
  aiV1ErrorSchema,
  healthV1Path,
  healthV1SuccessSchema,
  feedbackV1Path,
  weatherV1Path,
  weatherV2Path,
  placeSearchV1Path,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import { createErrorResponse, jsonHeaders } from './json-response.ts';

/**
 * The structural subset of the runtime's `ExecutionContext` the handlers use. Always call
 * `ctx.waitUntil(...)` on the object: a destructured `waitUntil` loses `this` and throws
 * "Illegal invocation" in workerd.
 */
export type ExecutionContext = Readonly<{
  waitUntil(promise: Promise<unknown>): void;
}>;
export type Handler = (request: Request, ctx: ExecutionContext) => Promise<Response>;
type Dependencies = Readonly<{
  weatherHandler: Handler;
  placeSearchHandler: Handler;
  accountDeleteHandler: Handler;
  feedbackHandler: Handler;
  aiHandler: Handler;
  probeHandler: Handler;
  aiReady: boolean;
}>;

const errorResponse = createErrorResponse<AiV1ErrorCode>(aiV1ErrorSchema);

export function createRouter({
  weatherHandler,
  placeSearchHandler,
  accountDeleteHandler,
  feedbackHandler,
  aiHandler,
  probeHandler,
  aiReady,
}: Dependencies): Handler {
  return async (request: Request, ctx: ExecutionContext): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    if (pathname === placeSearchV1Path) return placeSearchHandler(request, ctx);
    if (pathname === accountDeleteV1Path) return accountDeleteHandler(request, ctx);
    if (pathname === feedbackV1Path) return feedbackHandler(request, ctx);
    if (pathname === weatherV1Path || pathname === weatherV2Path) {
      return weatherHandler(request, ctx);
    }
    if (pathname === aiRecommendV1Path || pathname === aiRecommendV2Path) {
      return aiHandler(request, ctx);
    }
    if (pathname === aiProbeV1Path) return probeHandler(request, ctx);

    if (pathname === healthV1Path) {
      if (request.method !== 'GET') {
        return errorResponse(405, 'method_not_allowed', { Allow: 'GET' });
      }
      const body = healthV1SuccessSchema.parse({ data: { status: 'ok' } });
      return Response.json(body, { status: 200, headers: jsonHeaders });
    }

    if (pathname === aiReadyV1Path) {
      if (request.method !== 'GET') {
        return errorResponse(405, 'method_not_allowed', { Allow: 'GET' });
      }
      const body = aiReadyV1SuccessSchema.parse({
        data: { status: aiReady ? 'ready' : 'not_configured' },
      });
      return Response.json(body, { status: 200, headers: jsonHeaders });
    }

    return errorResponse(404, 'not_found');
  };
}
