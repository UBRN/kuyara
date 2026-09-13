// The one synchronous read in the app. `Observe.configure()` has to run at module scope,
// before the first render and long before the async profile repository exists, so the
// consent answer that gates dispatch is read straight from the same SQLite file and column
// the repository owns. It is read-only: no migration runs, no row is created, nothing is
// written.
//
// Every failure reads as `undecided`, which is the state that does not dispatch. A first
// launch has no table yet, a corrupt file throws, and both are answered the same way: stay
// silent until the person has answered.
import {
  analyticsConsentSchema,
  type AnalyticsConsent,
} from '@/features/profile/domain/profile';
import type { SqliteSyncReader } from '@/infrastructure/sqlite/sqlite-database';

const selectConsentSql =
  'SELECT analytics_consent FROM local_profiles WHERE singleton_key = 1';

type ConsentRow = Readonly<{ analytics_consent?: unknown }>;

export function readAnalyticsConsentSync(
  open: () => SqliteSyncReader,
): AnalyticsConsent {
  let reader: SqliteSyncReader | null = null;
  try {
    reader = open();
    const row = reader.getFirstSync<ConsentRow>(selectConsentSql);
    const parsed = analyticsConsentSchema.safeParse(row?.analytics_consent);
    return parsed.success ? parsed.data : 'undecided';
  } catch {
    return 'undecided';
  } finally {
    try {
      reader?.closeSync();
    } catch {
      // Closing is best effort: a handle that cannot be closed must not turn a successful
      // read into a launch failure.
    }
  }
}
