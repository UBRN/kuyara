import {
  aiProbeV1Path,
  aiReadyV1Path,
  aiReadyV1SuccessSchema,
  aiRecommendV1Path,
  aiV1ErrorSchema,
  healthV1Path,
  healthV1SuccessSchema,
  weatherV1Path,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

type Handler = (request: Request) => Promise<Response>;
type Dependencies = Readonly<{
  weatherHandler: Handler;
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
  aiHandler,
  probeHandler,
  aiReady,
}: Dependencies): Handler {
  return async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname;
    if (pathname === weatherV1Path) return weatherHandler(request);
    if (pathname === aiRecommendV1Path) return aiHandler(request);
    if (pathname === aiProbeV1Path) return probeHandler(request);

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
