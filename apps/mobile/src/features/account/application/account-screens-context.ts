import { createContext, useContext, useSyncExternalStore } from 'react';

import {
  createInMemoryAccountScreens,
  type AccountScreensPort,
  type AccountScreensSnapshot,
} from '@/features/account/application/account-screens';

// The in-memory port is the default until the real one is composed; tests provide their own.
export const AccountScreensContext = createContext<AccountScreensPort>(createInMemoryAccountScreens());

export function useAccountScreens(): Readonly<{ port: AccountScreensPort; snapshot: AccountScreensSnapshot }> {
  const port = useContext(AccountScreensContext);
  const snapshot = useSyncExternalStore(port.subscribe, port.getSnapshot);
  return { port, snapshot };
}
