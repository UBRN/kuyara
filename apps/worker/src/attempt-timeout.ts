/** An attempt that ran past its deadline and was aborted. */
export class AttemptTimeoutError extends Error {
  constructor() {
    super('The attempt timed out.');
    this.name = 'AttemptTimeoutError';
  }
}

/**
 * Runs `attempt` against a deadline. At `timeoutMs` the caller's controller is aborted and the
 * race rejects with `AttemptTimeoutError`; the timer never outlives the race. The attempt
 * should take `controller.signal` so the work behind it stops too.
 */
export async function raceWithTimeout<T>(
  controller: AbortController,
  attempt: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([attempt(), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Runs `work` with a signal that aborts after `timeoutMs`; the timer never outlives the work.
 * Nothing is raced: `work` must pass the signal on (a `fetch` does) and fails with its own
 * abort error, which the caller classifies. Use `raceWithTimeout` for work that may ignore it.
 */
export async function withDeadline<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
