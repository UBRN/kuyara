import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  CryptoDigestAlgorithm,
  CryptoEncoding,
  aesDecryptAsync,
  aesEncryptAsync,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

// The device's cryptography other than ids (`new-uuid.ts`): random bytes, SHA-256 and
// AES-256-GCM, for the account session at rest and the sign-in nonce (ADR 0041 sections 1 and 9).
// Keys and sealed values travel as base64 text: a 12-byte IV, the ciphertext, a 16-byte tag.

const gcm = { ivLength: 12, tagLength: 16 } as const;
const importKey = (encoded: string) => AESEncryptionKey.import(encoded, 'base64');

export const deviceCrypto = {
  randomBytes: (count: number): Uint8Array => getRandomBytes(count),
  sha256Hex: (text: string): Promise<string> =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, text, { encoding: CryptoEncoding.HEX }),
  aesGcm: {
    async newKey(): Promise<string> {
      return (await AESEncryptionKey.generate(AESKeySize.AES256)).encoded('base64');
    },
    async seal(encodedKey: string, plaintext: Uint8Array): Promise<string> {
      const sealed = await aesEncryptAsync(plaintext, await importKey(encodedKey), {
        nonce: { length: gcm.ivLength }, tagLength: gcm.tagLength,
      });
      return sealed.combined('base64');
    },
    async open(encodedKey: string, sealed: string): Promise<Uint8Array> {
      return aesDecryptAsync(AESSealedData.fromCombined(sealed, gcm), await importKey(encodedKey), { output: 'bytes' });
    },
  },
};
