export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** What the caller throws for each way the exchange can fail before a body is in hand. */
export type FetchJsonFailures = Readonly<{
  /** The request never produced a response: offline, refused or aborted by the timeout. */
  network: (cause: unknown) => unknown;
  /** A response arrived whose body is not JSON, or could not be read in time. */
  invalidJson: () => unknown;
}>;

/**
 * The one request-with-a-deadline every mobile data-layer network call goes through: it aborts
 * the request after `timeoutMilliseconds`, which also covers reading the body, and parses the
 * body as JSON once. It leaves the status and the body's shape to the caller, which maps each
 * failure to its own error kind. The body is untrusted until the caller's schema has read it.
 */
export async function fetchJsonWithTimeout(
  send: Fetch,
  url: string,
  init: RequestInit,
  timeoutMilliseconds: number,
  failures: FetchJsonFailures,
): Promise<Readonly<{ response: Response; body: unknown }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    let response: Response;
    try {
      response = await send(url, { ...init, signal: controller.signal });
    } catch (cause) {
      throw failures.network(cause);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw failures.invalidJson();
    }

    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * `send` with a deadline, for a client library that sends and parses its own requests (the
 * Supabase client) and so cannot go through `fetchJsonWithTimeout`: each request is
 * aborted `timeoutMilliseconds` after it starts unless it has answered by then, so a request that
 * never answers cannot hold its caller for good. React Native's fetch answers once the whole body
 * has arrived, so there the deadline covers the body too. An abort signal of the caller's own
 * still aborts the request.
 */
export function fetchWithTimeout(send: typeof fetch, timeoutMilliseconds: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    const callerSignal = init?.signal ?? null;
    const abortWithCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    callerSignal?.addEventListener('abort', abortWithCaller);
    try {
      return await send(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortWithCaller);
    }
  };
}
