import { rateLimitedHeaders, type RouteRefusal } from './json-request.ts';

/** The one owner of the Worker's JSON response headers and of the `{ error: { code } }` envelope. */
export const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

type ErrorEnvelopeSchema = Readonly<{ parse(input: unknown): unknown }>;

/**
 * A route's error responder: the contract's own schema validates the envelope, so a code the
 * route's contract does not list cannot ship. `extraHeaders` (Allow, Retry-After) ride along.
 */
export function createErrorResponse<Code extends string>(schema: ErrorEnvelopeSchema) {
  return (
    status: number,
    code: Code,
    extraHeaders?: Readonly<Record<string, string>>,
  ): Response => Response.json(schema.parse({ error: { code } }), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

type RefusalCode = 'method_not_allowed' | 'rate_limited' | 'invalid_request';

/**
 * The answer to a request refused before its route ran: the same status and headers on every
 * route, in the route's own codes. `unavailable` is the code that route gives a failing limiter.
 */
export function refusalResponse<Unavailable extends string>(
  respond: (
    status: number,
    code: RefusalCode | Unavailable,
    extraHeaders?: Readonly<Record<string, string>>,
  ) => Response,
  refusal: RouteRefusal,
  unavailable: Unavailable,
): Response {
  switch (refusal) {
    case 'method_not_allowed': return respond(405, 'method_not_allowed', { Allow: 'POST' });
    case 'rate_limited': return respond(429, 'rate_limited', rateLimitedHeaders);
    case 'limiter_unavailable': return respond(503, unavailable);
    case 'invalid_request': return respond(400, 'invalid_request');
  }
}
