export type FetchLike = typeof globalThis.fetch;

/**
 * The runtime's fetch, bound to the global. Calling it as a stored property passes the wrong
 * `this`, which workerd rejects, so every adapter that has no injected fetch takes it from
 * here, some when they are built and some at each call. It is the one place the Worker reads
 * `globalThis.fetch`.
 */
export function defaultFetch(): FetchLike {
  return globalThis.fetch.bind(globalThis);
}
