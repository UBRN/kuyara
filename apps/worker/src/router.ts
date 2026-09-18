import {
  aiProbeV1Path,
  aiReadyV1Path,
  aiReadyV1SuccessSchema,
  aiRecommendV1Path,
  aiV1ErrorSchema,
  healthV1Path,
  healthV1SuccessSchema,
  weatherV1Path,
  weatherV2Path,
  placeSearchV1Path,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

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
  aiHandler: Handler;
  probeHandler: Handler;
  aiReady: boolean;
}>;

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

function errorResponse(
  status: number,
  code: AiV1ErrorCode,
  extraHeaders?: Readonly<Record<string, string>>,
): Response {
  const body = aiV1ErrorSchema.parse({ error: { code } });
  return Response.json(body, {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

export function createRouter({
  weatherHandler,
  placeSearchHandler,
  aiHandler,
  probeHandler,
  aiReady,
}: Dependencies): Handler {
  return async (request: Request, ctx: ExecutionContext): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    if (pathname === placeSearchV1Path) return placeSearchHandler(request, ctx);
    if (pathname === weatherV1Path || pathname === weatherV2Path) {
      return weatherHandler(request, ctx);
    }
    if (pathname === aiRecommendV1Path) return aiHandler(request, ctx);
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
