/** How an AI recommendation request failed; the data adapter throws it, the application layer reads it. */
export type WorkerAiClientFailureKind =
  | 'invalid-request'
  | 'network'
  | 'service'
  | 'invalid-response';

export class WorkerAiClientError extends Error {
  readonly kind: WorkerAiClientFailureKind;
  /**
   * Whether the Worker may have received the request, and so counted it. False only for one
   * that never reached it: refused before sending, with no Worker address to send it to, or
   * a `network` failure the phone's own timeout did not abort (offline, refused). A timed-out
   * one may still have been answered and counted.
   */
  readonly mayHaveReachedWorker: boolean;

  constructor(
    kind: WorkerAiClientFailureKind,
    { timedOut = false, sent = true }: Readonly<{ timedOut?: boolean; sent?: boolean }> = {},
  ) {
    super('The AI recommendation request could not be completed.');
    this.name = 'WorkerAiClientError';
    this.kind = kind;
    this.mayHaveReachedWorker = sent && kind !== 'invalid-request' && (kind !== 'network' || timedOut);
  }
}
