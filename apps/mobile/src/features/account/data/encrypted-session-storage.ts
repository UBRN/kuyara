// The Supabase session at rest (ADR 0041 section 9): a random AES-GCM key in the Keychain, the
// sealed session in the key-value store. The key never leaves this device (it is stored
// `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), so a phone restored from a backup cannot open the
// session, and a reinstall, which removes the store, starts signed out. A value that cannot be
// opened reads as no session; a store that cannot be read throws, so the session is read again
// later instead of ending.

/** The one Keychain entry that holds the encoded key. */
export type SessionKeyStore = Readonly<{
  get: () => Promise<string | null>;
  set: (encodedKey: string) => Promise<void>;
}>;

/** Where the sealed session lives, by the name the auth client gives it. */
export type SessionValueStore = Readonly<{
  get: (name: string) => Promise<string | null>;
  set: (name: string, sealed: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
}>;

/** AES-GCM over bytes; the key and the sealed value travel as text. */
export type SessionCipher = Readonly<{
  newKey: () => Promise<string>;
  seal: (encodedKey: string, plaintext: Uint8Array) => Promise<string>;
  open: (encodedKey: string, sealed: string) => Promise<Uint8Array>;
}>;

/** The storage contract the Supabase auth client reads and writes its session through. */
export type SessionStorage = Readonly<{
  getItem: (name: string) => Promise<string | null>;
  setItem: (name: string, value: string) => Promise<void>;
  removeItem: (name: string) => Promise<void>;
}>;

/** UTF-8 without `TextEncoder`, which the app does not rely on: `encodeURIComponent` emits it. */
export function utf8Bytes(text: string): Uint8Array {
  const escaped = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index += 1) {
    if (escaped[index] === '%') {
      bytes.push(Number.parseInt(escaped.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(escaped.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

/** The inverse of `utf8Bytes`; invalid UTF-8 throws. */
export function utf8Text(bytes: Uint8Array): string {
  let escaped = '';
  for (const byte of bytes) escaped += `%${byte.toString(16).padStart(2, '0')}`;
  return decodeURIComponent(escaped);
}

export function createEncryptedSessionStorage({ cipher, keys, values }: Readonly<{
  keys: SessionKeyStore;
  values: SessionValueStore;
  cipher: SessionCipher;
}>): SessionStorage {
  // One key per install: concurrent first writes share the one being created.
  let creating: Promise<string> | null = null;
  const writableKey = async () => {
    const existing = await keys.get();
    if (existing !== null) return existing;
    creating ??= (async () => {
      const created = await cipher.newKey();
      await keys.set(created);
      return created;
    })().finally(() => { creating = null; });
    return creating;
  };

  return {
    async getItem(name) {
      const sealed = await values.get(name);
      if (sealed === null) return null;
      const key = await keys.get();
      if (key === null) return null;
      try {
        return utf8Text(await cipher.open(key, sealed));
      } catch {
        return null;
      }
    },
    async setItem(name, value) {
      await values.set(name, await cipher.seal(await writableKey(), utf8Bytes(value)));
    },
    async removeItem(name) {
      await values.remove(name);
    },
  };
}
