export type WorkerAiProbeFailureKind =
  | 'network'
  | 'service'
  | 'rate-limited'
  | 'invalid-response';

/** How an AI status check failed; the data adapter throws it, the application layer reads it. */
export class WorkerAiProbeClientError extends Error {
  readonly kind: WorkerAiProbeFailureKind;

  constructor(kind: WorkerAiProbeFailureKind) {
    super('The AI status check could not be completed.');
    this.name = 'WorkerAiProbeClientError';
    this.kind = kind;
  }
}
