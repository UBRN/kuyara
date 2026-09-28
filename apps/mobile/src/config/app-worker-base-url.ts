import { Platform } from 'react-native';

import { resolveWorkerBaseUrl, workerPlatform } from './worker-base-url';

/**
 * The one place the app reads the public Worker base URL variable (Metro inlines this literal
 * `process.env` access). Every Worker client resolves its origin through here; `configuredUrl` is a test seam.
 */
export function resolveAppWorkerBaseUrl(
  configuredUrl: string | undefined = process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL,
): string {
  return resolveWorkerBaseUrl({
    configuredUrl,
    isDevelopment: __DEV__,
    platform: workerPlatform(Platform.OS),
  });
}
