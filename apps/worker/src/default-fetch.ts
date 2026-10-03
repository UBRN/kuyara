export type FetchLike = typeof globalThis.fetch;

/**
 * The runtime's fetch, bound to the global. Calling it as a stored property passes the wrong
 * `this`, which workerd rejects, so every adapter that has no injected fetch resolves this at
 * call time. It is the one place the Worker reads `globalThis.fetch`.
 */
export function defaultFetch(): FetchLike {
  return globalThis.fetch.bind(globalThis);
}
