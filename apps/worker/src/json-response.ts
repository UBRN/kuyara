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
