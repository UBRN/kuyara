import { WeatherProviderError } from './weather-provider-error.ts';

export type WeatherKitCredentials = Readonly<{
  teamId: string;
  serviceId: string;
  keyId: string;
  privateKeyPem: string;
}>;

export type WeatherKitTokenProvider = () => Promise<string>;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes(privateKeyPem: string): ArrayBuffer {
  const encoded = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/gu, '');
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)).buffer;
}

export function createWeatherKitTokenProvider(
  credentials: WeatherKitCredentials,
  options?: Readonly<{ now?: () => Date; lifetimeSeconds?: number }>,
): WeatherKitTokenProvider {
  const now = options?.now ?? (() => new Date());
  const lifetimeSeconds = options?.lifetimeSeconds ?? 3600;
  let key: Promise<CryptoKey> | undefined;
  let cached: Readonly<{ token: string; expiresAt: number }> | undefined;

  return async () => {
    const issuedAt = Math.floor(now().getTime() / 1000);
    if (cached !== undefined && cached.expiresAt - issuedAt > 300) return cached.token;

    try {
      key ??= globalThis.crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes(credentials.privateKeyPem),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      );
      const expiresAt = issuedAt + lifetimeSeconds;
      const header = encodeJson({
        alg: 'ES256',
        kid: credentials.keyId,
        id: `${credentials.teamId}.${credentials.serviceId}`,
        typ: 'JWT',
      });
      const payload = encodeJson({
        iss: credentials.teamId,
        sub: credentials.serviceId,
        iat: issuedAt,
        exp: expiresAt,
      });
      const signingInput = `${header}.${payload}`;
      const signature = await globalThis.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        await key,
        new TextEncoder().encode(signingInput),
      );
      const token = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
      cached = { token, expiresAt };
      return token;
    } catch {
      throw new WeatherProviderError('auth');
    }
  };
}
