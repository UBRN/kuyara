import { ProfileBootstrapError } from '@/features/profile/application/profile-application-controller';
import { LocalProfileRepository } from '@/features/profile/data/profile-repository';
import { SqliteProfileLocalDataSource } from '@/features/profile/data/sqlite-profile-local-data-source';
import { openMigratedDatabase } from '@/infrastructure/sqlite/open-migrated-database';
import { newUuid } from '@/infrastructure/new-uuid';
import { systemNow } from '@/infrastructure/system-clock';

/**
 * The one place the profile repository is opened and migrated. It is a plain function so the
 * foreground provider and the headless background task share it without React.
 */
export async function loadProfileRepository() {
  const database = await openMigratedDatabase(
    (stage, cause) => new ProfileBootstrapError(stage, cause),
  );

  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: newUuid,
    now: systemNow,
  });

  return new LocalProfileRepository(dataSource);
}
