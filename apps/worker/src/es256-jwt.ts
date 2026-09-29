/** A closed failure: signing never surfaces the key, the input or the runtime's own message. */
export class Es256SigningError extends Error {
  constructor() {
    super('es256_signing_failed');
    this.name = 'Es256SigningError';
  }
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

/** Bytes of an unpadded base64url string, or null when it is not one. */
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    // Impossible lengths (one leftover character) are malformed input, not an error to surface.
    return null;
  }
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes(privateKeyPem: string): ArrayBuffer {
  const encoded = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/gu, '');
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)).buffer;
}

export type Es256Signer = (
  header: Readonly<Record<string, unknown>>,
  payload: Readonly<Record<string, unknown>>,
) => Promise<string>;

/**
 * Signs a compact ES256 JWT with a PKCS8 P-256 key (PEM markers optional). The caller owns
 * the header and claims, so WeatherKit and Sign in with Apple share one signer. The imported
 * key is memoised per signer; a rejected import is dropped so the next call imports again.
 */
export function createEs256Signer(privateKeyPem: string): Es256Signer {
  let key: Promise<CryptoKey> | undefined;
  return async (header, payload) => {
    try {
      key ??= globalThis.crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes(privateKeyPem),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
      const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
      const signature = await globalThis.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        await key,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
    } catch {
      key = undefined;
      throw new Es256SigningError();
    }
  };
}
