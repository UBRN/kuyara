import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  resolveWorkerBaseUrl,
  WorkerBaseUrlConfigurationError,
} from '@/config/worker-base-url';
import {
  mapProbeError,
  mapProbeResult,
  startAiProbe,
  type AiProbeUiState,
} from '@/features/recommendation/application/ai-probe-state';
import { WorkerAiProbeClient } from '@/features/recommendation/data/worker-ai-probe-client';

export type { AiProbeUiState } from '@/features/recommendation/application/ai-probe-state';

type Dependencies = Readonly<{
  client?: Pick<WorkerAiProbeClient, 'probe'>;
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
      return resolveWorkerBaseUrl({
        configuredUrl:
          dependencies?.baseUrl ?? process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL,
        isDevelopment: __DEV__,
        platform: Platform.OS === 'android'
          ? 'android'
          : Platform.OS === 'web'
            ? 'web'
            : 'ios',
      });
    } catch (error) {
      if (error instanceof WorkerBaseUrlConfigurationError) return null;
      throw error;
    }
  }, [dependencies?.baseUrl]);
  const client = useMemo(
    () => dependencies?.client ?? (baseUrl ? new WorkerAiProbeClient({ baseUrl }) : null),
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
