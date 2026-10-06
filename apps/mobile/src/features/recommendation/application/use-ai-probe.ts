import { useCallback, useMemo, useRef, useState } from 'react';

import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { WorkerBaseUrlConfigurationError } from '@/config/worker-base-url';
import { createAiProbeClient } from '@/features/recommendation/application/ai-probe-client-loader';
import {
  mapProbeError,
  mapProbeResult,
  startAiProbe,
  type AiProbeClient,
  type AiProbeUiState,
} from '@/features/recommendation/application/ai-probe-state';

export type { AiProbeUiState } from '@/features/recommendation/application/ai-probe-state';

type Dependencies = Readonly<{
  client?: AiProbeClient;
  baseUrl?: string;
}>;

export function useAiProbe(dependencies?: Dependencies): Readonly<{
  state: AiProbeUiState;
  isSupported: boolean;
  // Resolves with the settled probe state so a caller can report it (taxonomy 5.9's
  // `ai_probe_triggered`), or `null` when the probe was unsupported or already running.
  check: () => Promise<AiProbeUiState | null>;
}> {
  const baseUrl = useMemo(() => {
    try {
      return resolveAppWorkerBaseUrl(dependencies?.baseUrl);
    } catch (error) {
      if (error instanceof WorkerBaseUrlConfigurationError) return null;
      throw error;
    }
  }, [dependencies?.baseUrl]);
  const client = useMemo(
    () => dependencies?.client ?? (baseUrl ? createAiProbeClient(baseUrl) : null),
    [baseUrl, dependencies?.client],
  );
  const [state, setState] = useState<AiProbeUiState>({ kind: 'idle' });
  const isChecking = useRef(false);
  const isSupported = client !== null;

  const check = useCallback((): Promise<AiProbeUiState | null> => {
    if (!client || isChecking.current) return Promise.resolve(null);

    isChecking.current = true;
    setState((current) => startAiProbe(current, true));
    return client.probe()
      .then(
        (result) => mapProbeResult(result),
        (error: unknown) => mapProbeError(error),
      )
      .then((next) => {
        setState(next);
        return next;
      })
      .finally(() => {
        isChecking.current = false;
      });
  }, [client]);

  return { state, isSupported, check };
}
