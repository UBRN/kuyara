/**
 * One Durable Object per counter name (`idFromName(name)`), holding the date keys its
 * callers already use (`probe:YYYY-MM-DD`, `weather:weatherkit:YYYY-MM-DD`, ...). Distinct
 * counters therefore never serialise through one object.
 *
 * Nothing here imports `cloudflare:workers`: the Node test runner cannot resolve that
 * scheme and `index.test.mjs` imports `index.ts`, which re-exports this class for wrangler.
 * The runtime shapes below are the structural subset the counter uses, so a Map-backed fake
 * satisfies them in tests.
 */

export interface DailyCounterStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(): Promise<Map<string, T>>;
}

export interface DailyCounterState {
  storage: DailyCounterStorage;
}

export interface DailyCounterStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DailyCounterNamespace<Id = unknown> {
  idFromName(name: string): Id;
  get(id: Id): DailyCounterStub;
}

export interface DurableDailyCounter {
  get(dateKey: string): Promise<number>;
  increment(dateKey: string): Promise<number>;
}

const dailyCounterOrigin = 'https://daily-counter';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export class DailyCounter {
  readonly #storage: DailyCounterStorage;

  constructor(ctx: DailyCounterState, _env: unknown) {
    this.#storage = ctx.storage;
  }

  /**
   * `GET /count?key=<dateKey>` answers `{ count }`; `POST /increment?key=<dateKey>` adds one
   * and answers the new `{ count }`. Durable Object input gates hold every other request to
   * this object while a request's storage operations are in flight, so the get-then-put
   * below is one atomic increment, not a read-modify-write race.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (url.pathname === '/count') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      if (!key) return json({ error: 'missing_key' }, 400);
      return json({ count: (await this.#storage.get<number>(key)) ?? 0 });
    }
    if (url.pathname === '/increment') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!key) return json({ error: 'missing_key' }, 400);
      const count = ((await this.#storage.get<number>(key)) ?? 0) + 1;
      await this.#storage.put(key, count);
      // Old date keys must not pile up: the first increment of a new key drops the others,
      // so the sweep runs once a day per object.
      if (count === 1) {
        for (const stored of (await this.#storage.list()).keys()) {
          if (stored !== key) await this.#storage.delete(stored);
        }
      }
      return json({ count });
    }
    return json({ error: 'not_found' }, 404);
  }
}

async function readCount(response: Response): Promise<number> {
  if (response.status !== 200) {
    throw new Error(`Daily counter answered ${response.status}.`);
  }
  const body: unknown = await response.json();
  const count = (body as { count?: unknown }).count;
  if (typeof count !== 'number') throw new Error('Daily counter answered without a count.');
  return count;
}

export function createDurableDailyCounter<Id>(
  namespace: DailyCounterNamespace<Id>,
  name: string,
): DurableDailyCounter {
  // The stub is an I/O object bound to the request that created it, and the composition
  // that holds this adapter is memoised across requests, so the stub is resolved per call:
  // a stub taken once at composition fails every later request with "Cannot perform I/O
  // on behalf of a different request" (seen live in workerd). The namespace binding itself
  // is request-independent.
  const stub = (): DailyCounterStub => namespace.get(namespace.idFromName(name));
  const url = (path: string, dateKey: string): string =>
    `${dailyCounterOrigin}${path}?key=${encodeURIComponent(dateKey)}`;
  return {
    get: async (dateKey) => readCount(await stub().fetch(url('/count', dateKey))),
    increment: async (dateKey) =>
      readCount(await stub().fetch(url('/increment', dateKey), { method: 'POST' })),
  };
}
