import Storage from 'expo-sqlite/kv-store';

/**
 * The device key-value store, `expo-sqlite/kv-store`: its own database file beside kuyara.db,
 * removed with the app. The account session lives here sealed (ADR 0041 section 9).
 */
export const deviceKeyValueStore = {
  get: (name: string): Promise<string | null> => Storage.getItemAsync(name),
  set: (name: string, value: string): Promise<void> => Storage.setItemAsync(name, value),
  async remove(name: string): Promise<void> {
    await Storage.removeItemAsync(name);
  },
};
