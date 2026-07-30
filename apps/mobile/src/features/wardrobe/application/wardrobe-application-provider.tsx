import * as Crypto from 'expo-crypto';
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { WardrobeApplicationController } from '@/features/wardrobe/application/wardrobe-application-controller';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import { LocalWardrobeRepository } from '@/features/wardrobe/data/wardrobe-repository';
import { SqliteWardrobeLocalDataSource } from '@/features/wardrobe/data/sqlite-wardrobe-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

async function loadWardrobeRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);

  return new LocalWardrobeRepository(
    new SqliteWardrobeLocalDataSource(database),
    {
      createId: () => Crypto.randomUUID(),
      now: () => new Date().toISOString(),
    },
  );
}

type WardrobeApplicationProviderProps = PropsWithChildren<{
  localProfileId: string;
}>;

export function WardrobeApplicationProvider({
  children,
  localProfileId,
}: WardrobeApplicationProviderProps) {
  const controller = useMemo(
    () =>
      new WardrobeApplicationController(
        localProfileId,
        loadWardrobeRepository,
      ),
    [localProfileId],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  const operations = useMemo<Omit<WardrobeApplicationValue, 'state'>>(
    () => ({
      refresh: () => controller.refresh(),
      getItem: (id) => controller.getItem(id),
      createItem: (input) => controller.createItem(input),
      updateItem: (id, input) => controller.updateItem(id, input),
      softDeleteItem: (id) => controller.softDeleteItem(id),
    }),
    [controller],
  );
  const value = useMemo<WardrobeApplicationValue>(
    () => ({ ...operations, state }),
    [operations, state],
  );

  return (
    <WardrobeApplicationContext value={value}>
      {children}
    </WardrobeApplicationContext>
  );
}
