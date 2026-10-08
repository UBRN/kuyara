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
 * Supabase client) and so cannot go through `fetchJsonWithTimeout`: each request is aborted
 * `timeoutMilliseconds` after it starts unless its whole body has arrived by then, so a request
 * that never answers, or whose body stalls after the headers, cannot hold its caller for good.
 * Expo's fetch answers at the headers, so the body is read here, inside the deadline, and handed
 * back as a new response with the same status, status text and headers; the client reads text
 * and JSON only. An abort signal of the caller's own still aborts the request.
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
      const response = await send(input, { ...init, signal: controller.signal });
      const body = await textUntilAborted(response, controller.signal);
      // An empty body goes back as none, which a 204 requires.
      return new Response(body === '' ? null : body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortWithCaller);
    }
  };
}

/**
 * The body as text, or an `AbortError` once `signal` aborts: on the device, Expo's fetch never
 * settles a body read whose request was aborted, so the abort alone cannot end it.
 */
function textUntilAborted(response: Response, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The request timed out.', 'AbortError'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    response.text().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
