import * as Crypto from 'expo-crypto';

// The one place a fresh random UUID v4 is drawn: a new record's id, a photo file name or a
// one-off token. A repository or storage takes it as a dependency (`createId`), so a test hands in
// a fixed id instead.
export const newUuid = (): string => Crypto.randomUUID();
