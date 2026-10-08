/**
 * Keeps a session through a token refresh the auth service could not answer. The auth client ends
 * the stored session on every refresh failure it does not class as retryable, and that includes a
 * paused project (540), a rate limit (429) and a non-JSON page from something in between. None of
 * those is an answer about the session (ADR 0041 section 9), so each reaches the client as a 503.
 * A JSON answer below 500, such as a refused or revoked refresh token, passes through unchanged.
 */
export function keepSessionOnServiceFailure(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await send(input, init);
    if (response.ok || !isRefreshRequest(input)) return response;
    const isJson = (response.headers.get('content-type') ?? '').includes('json');
    if (response.status < 500 && response.status !== 429 && isJson) return response;
    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
  };
}

// The auth client passes the refresh URL as a string.
function isRefreshRequest(input: RequestInfo | URL): boolean {
  return typeof input === 'string' && input.includes('/auth/v1/token?grant_type=refresh_token');
}
