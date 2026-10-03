/** The one owner of how a Worker route reads a request body: never unbounded. */

/**
 * Reads a body as text but stops, cancelling the stream, once it passes `maxBytes`; that
 * case is `undefined`. The limit is enforced while reading, never after buffering it all.
 */
export async function readTextWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | undefined> {
  if (body === null) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * A request body read within `maxBytes` and parsed as JSON; `undefined` when it is empty,
 * oversized or not JSON, which every caller answers as an invalid request.
 */
export async function readJsonBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<unknown> {
  try {
    const text = await readTextWithLimit(body, maxBytes);
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    // A stream error or text that is not JSON: the one answer is `undefined`.
    return undefined;
  }
}
