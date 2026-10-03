import type { FetchLike } from '../default-fetch.ts';
import { readTextWithLimit } from '../json-request.ts';
import { AccountError } from './account-error.ts';

// The account routes read small JSON bodies; anything larger is not an answer they know.
const maxBodyBytes = 65_536;

/**
 * One upstream call with a deadline that also covers reading the body. A network failure or
 * a timeout is the closed `unavailable`; the runtime's own message is dropped. The body comes
 * back as parsed JSON, or `undefined` when it is empty, oversized or not JSON, and the caller
 * decides what that means for its call. It is never logged or forwarded.
 */
export async function boundedFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Readonly<{ status: number; json: unknown }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // 'manual', not 'error': workerd rejects 'error' before any network call.
    const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal });
    const text = await readTextWithLimit(response.body, maxBodyBytes);
    // An oversized answer is not one this call knows how to read: fail closed.
    if (text === undefined) throw new AccountError('unavailable');
    let json: unknown;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        // A body that is not JSON is reported as no JSON; the status still tells the story.
        json = undefined;
      }
    }
    return { status: response.status, json };
  } catch {
    throw new AccountError('unavailable');
  } finally {
    clearTimeout(timer);
  }
}
