/** How an AI recommendation request failed; the data adapter throws it, the application layer reads it. */
export type WorkerAiClientFailureKind =
  | 'invalid-request'
  | 'network'
  | 'service'
  | 'invalid-response';

export class WorkerAiClientError extends Error {
  readonly kind: WorkerAiClientFailureKind;
  /**
   * A `network` failure the phone's own timeout aborted: the Worker may still have answered and
   * counted the request. False for one that never reached it (offline, refused).
   */
  readonly timedOut: boolean;

  constructor(kind: WorkerAiClientFailureKind, { timedOut = false }: Readonly<{ timedOut?: boolean }> = {}) {
    super('The AI recommendation request could not be completed.');
    this.name = 'WorkerAiClientError';
    this.kind = kind;
    this.timedOut = timedOut;
  }
}
