import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { resolveSupabaseSettings, type SupabaseSettings } from '@/config/supabase-settings';
import { connectAccountLifecycle, type AccountLifecyclePorts } from '@/features/account/application/account-lifecycle';
import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { createClosedAccountScreens, type AccountScreensPort } from '@/features/account/application/account-screens';
import { AccountScreensContext } from '@/features/account/application/account-screens-context';
import type { LiveAccountSession } from '@/features/account/data/live-account-session';
import { subscribeDatabaseWrites } from '@/infrastructure/sqlite/expo-sqlite-database';
import { openMigratedDatabase } from '@/infrastructure/sqlite/open-migrated-database';

/** The app's lifetime ports for the live session: its manager, the app state, the database writes and Apple's revocation. */
export function liveLifecyclePorts(live: LiveAccountSession): AccountLifecyclePorts {
  return {
    manager: live.manager,
    onAppStateChange: (listener) => {
      const subscription = AppState.addEventListener('change', listener);
      return () => subscription.remove();
    },
    isActive: () => AppState.currentState === 'active',
    onDatabaseWrite: subscribeDatabaseWrites,
    hasPending: live.source.hasPending,
    onAppleRevoked: live.onAppleRevoked,
    autoRefresh: live.autoRefresh,
    card: { dismissed: live.source.cardDismissed, dismiss: live.source.dismissCard },
    schedule: (task, delayMs) => {
      const timer = setTimeout(task, delayMs);
      return () => clearTimeout(timer);
    },
  };
}

/**
 * The live session for this profile, connected to the app's lifetime; resolves with the port
 * and the disconnect. The live module loads the native sign-in and Keychain code, so it is
 * imported only here.
 */
async function connectLiveAccounts(localProfileId: string, settings: SupabaseSettings) {
  const [database, { createLiveAccountSession }] = await Promise.all([
    openMigratedDatabase(),
    import('@/features/account/data/live-account-session'),
  ]);
  const live = createLiveAccountSession({
    database, localProfileId, settings, workerBaseUrl: resolveAppWorkerBaseUrl(), fetcher: fetch,
  });
  const disconnect = connectAccountLifecycle(liveLifecyclePorts(live));
  const port: AccountScreensPort = live.manager;
  return { port, disconnect };
}

/**
 * Composes the live account session into `AccountScreensContext` when the account screens are
 * switched on and the Supabase settings exist. With the screens on, the context is never the
 * in-memory port: until the live session is composed, and for good when the settings are missing
 * or invalid or composing fails, it is the closed port, where every sign-in fails. With the
 * screens off the app behaves as it does today.
 */
export function AccountApplicationProvider({ children, localProfileId }: PropsWithChildren<{ localProfileId: string }>) {
  const [port, setPort] = useState<AccountScreensPort | null>(null);
  const [closed] = useState(createClosedAccountScreens);

  useEffect(() => {
    const settings = ACCOUNT_SCREENS_ENABLED ? resolveSupabaseSettings() : null;
    if (settings === null) return undefined;
    let disconnect: (() => void) | null = null;
    let cancelled = false;
    connectLiveAccounts(localProfileId, settings).then((live) => {
      if (cancelled) {
        live.disconnect();
        return;
      }
      disconnect = live.disconnect;
      setPort(live.port);
    }, () => {
      // Accounts could not be composed (the database or the configuration): the closed port stays.
    });
    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [localProfileId]);

  if (!ACCOUNT_SCREENS_ENABLED) return children;
  return <AccountScreensContext value={port ?? closed}>{children}</AccountScreensContext>;
}
