import type { AiProbeV1Success } from '@kuyara/contracts';

import { WorkerAiProbeClientError } from '@/features/recommendation/data/worker-ai-probe-client';

export type AiProbeUiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  // ADR 0034 section 5: `assistant` names the provider and model that answered this check.
  // It is read by the Settings AI status screen only, never persisted and never captured.
  | { kind: 'ok'; checkedAt: string; assistant?: AiProbeV1Success['data']['assistant'] }
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
    ? { kind: 'ok', checkedAt: result.checkedAt, assistant: result.assistant }
    : { kind: 'unavailable' };
}

export function mapProbeError(error: unknown): AiProbeUiState {
  return error instanceof WorkerAiProbeClientError && error.kind === 'rate-limited'
    ? { kind: 'rate-limited' }
    : { kind: 'error' };
}
