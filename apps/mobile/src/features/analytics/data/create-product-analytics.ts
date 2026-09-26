// The composition point that turns configuration into an adapter. A missing development key
// selects local event logging for Simulator evidence; production stays on the no-op port, so
// missing configuration can never send anything (ADR 0033 section 3).
import { resolveProductAnalyticsConfiguration } from '@/config/product-analytics-config';
import { DevelopmentLoggingProductAnalytics } from '@/features/analytics/data/development-logging-product-analytics';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import {
  cleanupPendingKey,
  createFileStorage,
  createMemoryStorage,
  createPostHogProductAnalytics,
  forceOptedOutStorage,
  type SyncStringStorage,
} from '@/features/analytics/data/posthog-product-analytics';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

function readStoredConsent(): AnalyticsConsent {
  // Keep native SQLite and Observe out of the Node-only development logger path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readAnalyticsConsentSync } = require('./analytics-consent-sync-source') as typeof import('./analytics-consent-sync-source');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openKuyaraDatabaseSync } = require('../../../infrastructure/sqlite/expo-sqlite-database') as typeof import('../../../infrastructure/sqlite/expo-sqlite-database');
  return readAnalyticsConsentSync(openKuyaraDatabaseSync);
}

function disableTelemetryOnStartup(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { observePerformanceTelemetry } = require('./observe-performance-telemetry') as typeof import('./observe-performance-telemetry');
  observePerformanceTelemetry.setDispatching(false);
}

export function createUnavailableProductAnalytics(
  consent: AnalyticsConsent,
  suppliedStorage?: SyncStringStorage,
  disableTelemetry: () => void = disableTelemetryOnStartup,
): ProductAnalytics {
  // A missing or invalid provider configuration does not remove Observe's cleanup duty.
  // Keep the same durable marker and clear any older PostHog state before a later grant.
  const storage = suppliedStorage ?? (
    // Node-only tests have no Expo file module; a native file failure must stay visible.
    typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
      ? createFileStorage()
      : createMemoryStorage()
  );
  const markCleanupPending = () => storage.setItem(cleanupPendingKey, '1');
  const clearCleanupPending = () => storage.setItem(cleanupPendingKey, '0');
  const isCleanupPending = () => {
    try { return storage.getItem(cleanupPendingKey) === '1'; }
    catch { return true; }
  };
  const reconciliation = consent === 'withdrawn'
    ? Promise.resolve().then(() => {
      markCleanupPending();
      forceOptedOutStorage(storage);
      disableTelemetry();
      clearCleanupPending();
    }).catch(() => undefined)
    : Promise.resolve();
  return {
    ...noopProductAnalytics,
    markCleanupPending,
    clearCleanupPending,
    isCleanupPending,
    whenReady: () => reconciliation,
    prepareGrant: async () => {
      await reconciliation;
      forceOptedOutStorage(storage);
      clearCleanupPending();
    },
    withdraw: async () => { forceOptedOutStorage(storage); },
  };
}

export function createProductAnalytics(
  isDevelopment: boolean,
  consent: AnalyticsConsent,
): ProductAnalytics {
  const configuration = resolveProductAnalyticsConfiguration({
    apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    isDevelopment,
  });
  if (configuration.kind !== 'enabled') {
    return isDevelopment && !process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim()
      ? new DevelopmentLoggingProductAnalytics(consent)
      : createUnavailableProductAnalytics(consent);
  }
  return createPostHogProductAnalytics({
    apiKey: configuration.apiKey,
    host: configuration.host,
    consent,
    readConsent: readStoredConsent,
    disableTelemetryOnStartup,
  });
}
