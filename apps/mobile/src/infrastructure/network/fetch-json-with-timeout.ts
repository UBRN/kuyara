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
