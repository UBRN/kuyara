// The app's only importer of `expo-observe` (AGENTS.md keeps that greppable). Everything
// above this file depends on the `PerformanceTelemetry` port, exactly as product analytics
// depends on `ProductAnalytics` rather than on PostHog.
//
// Verified against the installed `expo-observe@57.0.24` and `expo-app-metrics@57.0.21`:
//
// - `configure()` is a full replacement the native side persists in its own UserDefaults
//   suite, and `shouldDispatch()` reads that persisted value at dispatch time, so calling
//   it again with a new `dispatchingEnabled` takes effect in the same session. Re-calling
//   it with the same `integrations` is safe: the router integration's `enable()` only sets
//   a boolean, and the provider only throws when the integration is *toggled* after mount.
// - There is no `errorHandlingEnabled` option in this version. The global `ErrorUtils`
//   handler is installed unconditionally when `expo-app-metrics` is first imported, so
//   unhandled JS errors are recorded from that moment; only dispatch is consent-gated.
// - Both packages call `requireNativeModule` at module scope, which throws wherever the
//   native module is absent (web, a build without the module). The require below is guarded
//   so importing this adapter is always safe and telemetry simply goes silent.
// - `dispatchingEnabled` gates delivery, not recording: a `logEvent` or `reportError` made
//   while it is false is still written to the on-device store, and a later flush sends every
//   row past the cursor, so it reaches the server after a later grant. Consent therefore has
//   to gate emission here as well, which is what `canEmit()` below does.
import { useCallback } from 'react';
import type { ComponentType } from 'react';

import type {
  PerformanceTelemetry,
  PerformanceTelemetryEventName,
  TelemetryAttributes,
  TelemetryError,
} from '@/features/analytics/domain/performance-telemetry';
import { telemetryFilteredRouteParams } from '@/features/analytics/domain/telemetry-route-params';
import { readAnalyticsConsentSync } from '@/features/analytics/data/analytics-consent-sync-source';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';
import { openKuyaraDatabaseSync } from '@/infrastructure/sqlite/expo-sqlite-database';

type ObserveApi = typeof import('expo-observe');

function loadObserve(): ObserveApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-observe') as ObserveApi;
  } catch {
    return null;
  }
}

// Resolved once, at import time, so the hook binding below is a module constant rather than
// a per-render decision.
const observe = loadObserve();

type ObserveConfiguration = Readonly<{
  dispatchingEnabled: boolean;
  environment: string;
  dispatchInDebug: boolean;
}>;

let applied: ObserveConfiguration | null = null;
let readStoredConsent: () => AnalyticsConsent = () =>
  readAnalyticsConsentSync(openKuyaraDatabaseSync);

function apply(configuration: ObserveConfiguration): void {
  try {
    observe?.Observe.configure({
      dispatchingEnabled: configuration.dispatchingEnabled,
      dispatchInDebug: configuration.dispatchInDebug,
      environment: configuration.environment,
      integrations: {
        'expo-router': { filteredParams: [...telemetryFilteredRouteParams] },
      },
    });
  } catch (error) {
    // A consent change must observe this failure before it stores the new answer.
    throw error;
  }
  applied = configuration;
}

// A debug build dispatches nothing in normal operation. The flag exists so one verification
// run can reach the dashboard, and it is off unless the environment sets it explicitly.
function dispatchInDebugRequested(): boolean {
  return process.env.EXPO_PUBLIC_KUYARA_OBSERVE_DISPATCH_IN_DEBUG === '1';
}

/**
 * Called once at module scope from the root layout, before any screen mounts, because the
 * expo-router integration cannot be enabled after the tree is mounted.
 */
export function configureObserveTelemetry(
  input: Readonly<{
    dispatchingEnabled: boolean;
    readConsent?: () => AnalyticsConsent;
  }>,
): void {
  if (input.readConsent) readStoredConsent = input.readConsent;
  try {
    apply({
      dispatchingEnabled: input.dispatchingEnabled,
      environment: __DEV__ ? 'development' : 'production',
      dispatchInDebug: dispatchInDebugRequested(),
    });
  } catch {
    // Launch stays usable; an interactive consent change reports configuration failures.
  }
}

// Nothing is recorded before the person has answered. `applied` is null until the root
// layout configures, so the window before configuration is silent too.
function canEmit(): boolean {
  return applied?.dispatchingEnabled === true && readStoredConsent() === 'granted';
}

export const observePerformanceTelemetry: PerformanceTelemetry = {
  isApplied: () => applied?.dispatchingEnabled === true,
  logEvent(name: PerformanceTelemetryEventName, attributes: TelemetryAttributes) {
    if (!canEmit()) return;
    try {
      observe?.Observe.logEvent(name, { attributes: { ...attributes } });
    } catch {
      // Telemetry never breaks the path it observes.
    }
  },
  reportError(error: TelemetryError) {
    if (!canEmit()) return;
    try {
      observe?.Observe.reportError(error);
    } catch {
      // As above: this is called from a catch block.
    }
  },
  setDispatching(enabled: boolean) {
    if (applied?.dispatchingEnabled === enabled) return;
    apply({
      dispatchingEnabled: enabled,
      environment: applied?.environment ?? (__DEV__ ? 'development' : 'production'),
      dispatchInDebug: applied?.dispatchInDebug ?? dispatchInDebugRequested(),
    });
  },
};

export type MarkInteractive = (params: TelemetryAttributes) => void;

function useObserveMarkInteractive(): MarkInteractive {
  // Safe: this binding is only exported when `observe` resolved, and that decision is made
  // once at module load, so a component always calls the same hook implementation.
  const { markInteractive } = observe!.useObserve();
  return useCallback(
    (params: TelemetryAttributes) => {
      if (!canEmit()) return;
      try {
        void markInteractive({ params: { ...params } });
      } catch {
        // As above.
      }
    },
    [markInteractive],
  );
}

const noopMarkInteractive: MarkInteractive = () => undefined;

function useNoopMarkInteractive(): MarkInteractive {
  return noopMarkInteractive;
}

/**
 * `useObserve().markInteractive` rather than the raw module call: with the expo-router
 * integration active the hook fills in the route pattern, which is what turns the mark into
 * a per-route `tti` metric.
 */
export const useObserveInteractiveMark: () => MarkInteractive = observe
  ? useObserveMarkInteractive
  : useNoopMarkInteractive;

/**
 * `ObserveRoot` marks the first render and mounts the router integration's provider. It is
 * applied to the root layout's default export; without the native module it is the identity
 * so the tree is unchanged.
 */
export function withObserveRoot<Props extends Record<string, unknown>>(
  Component: ComponentType<Props>,
): ComponentType<Props> {
  return observe ? observe.ObserveRoot.wrap(Component) : Component;
}
