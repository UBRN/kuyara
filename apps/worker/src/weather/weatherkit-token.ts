import { createEs256Signer } from '../es256-jwt.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

export type WeatherKitCredentials = Readonly<{
  teamId: string;
  serviceId: string;
  keyId: string;
  privateKeyPem: string;
}>;

export type WeatherKitTokenProvider = () => Promise<string>;

export function createWeatherKitTokenProvider(
  credentials: WeatherKitCredentials,
  options?: Readonly<{ now?: () => Date; lifetimeSeconds?: number }>,
): WeatherKitTokenProvider {
  const now = options?.now ?? (() => new Date());
  const lifetimeSeconds = options?.lifetimeSeconds ?? 3600;
  const sign = createEs256Signer(credentials.privateKeyPem);
  let cached: Readonly<{ token: string; expiresAt: number }> | undefined;

  return async () => {
    const issuedAt = Math.floor(now().getTime() / 1000);
    if (cached !== undefined && cached.expiresAt - issuedAt > 300) return cached.token;

    try {
      const expiresAt = issuedAt + lifetimeSeconds;
      const token = await sign(
        {
          alg: 'ES256',
          kid: credentials.keyId,
          id: `${credentials.teamId}.${credentials.serviceId}`,
          typ: 'JWT',
        },
        {
          iss: credentials.teamId,
          sub: credentials.serviceId,
          iat: issuedAt,
          exp: expiresAt,
        },
      );
      cached = { token, expiresAt };
      return token;
    } catch {
      throw new WeatherProviderError('auth');
    }
  };
}
