import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { subscribeDatabaseWrites } from '@/infrastructure/sqlite/expo-sqlite-database';

/**
 * How a screen's state shows the rows a sync pull lands (ADR 0041 section 4): while accounts
 * are open, `listener` runs once now and after every committed device-database write, and the
 * screen reads again only what changed. With accounts closed nothing pulls, so it never runs.
 * Returns the unsubscribe.
 */
export function followWritesWhileAccountsOpen(listener: () => void): () => void {
  if (!ACCOUNT_SCREENS_ENABLED) return () => undefined;
  const unsubscribe = subscribeDatabaseWrites(listener);
  listener();
  return unsubscribe;
}
