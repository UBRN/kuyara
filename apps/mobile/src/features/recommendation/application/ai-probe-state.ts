import type { AiProbeV1Success } from '@kuyara/contracts';

import { WorkerAiProbeClientError } from '@/features/recommendation/data/worker-ai-probe-client';

export type AiProbeUiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; checkedAt: string }
  | { kind: 'unavailable' }
  | { kind: 'rate-limited' }
  | { kind: 'error' };

export function startAiProbe(
  state: AiProbeUiState,
  isSupported: boolean,
): AiProbeUiState {
  return isSupported && state.kind !== 'checking' ? { kind: 'checking' } : state;
}

export function mapProbeResult(
  result: AiProbeV1Success['data'],
): AiProbeUiState {
  return result.status === 'ok'
    ? { kind: 'ok', checkedAt: result.checkedAt }
    : { kind: 'unavailable' };
}

export function mapProbeError(error: unknown): AiProbeUiState {
  return error instanceof WorkerAiProbeClientError && error.kind === 'rate-limited'
    ? { kind: 'rate-limited' }
    : { kind: 'error' };
}
