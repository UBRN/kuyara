import {
  appConfigV1ErrorSchema,
  appConfigV1Path,
  appConfigV1SiriCardValues,
  appConfigV1SuccessSchema,
  type AppConfigV1ErrorCode,
} from '@kuyara/contracts';

import { createErrorResponse, jsonHeaders } from './json-response.ts';

/** The structural subset of the Workers KV binding the route reads. */
export type AppConfigStore = Readonly<{ get(key: string): Promise<string | null> }>;

/** The KV key `scripts/app-config.mjs` writes. */
export const appConfigSiriCardKey = 'siri-card';

const error = createErrorResponse<AppConfigV1ErrorCode>(appConfigV1ErrorSchema);

/**
 * The stored value as the route's answer, or the closed reason there is none: the key is absent,
 * holds anything but an exact switch value, or cannot be read. The route then answers
 * `unavailable` and the device holds its last value, so a store fault never switches the card.
 */
async function storedSiriCard(store: AppConfigStore) {
  let value: string | null;
  try {
    value = await store.get(appConfigSiriCardKey);
  } catch {
    return { reason: 'read_failed' } as const; // the device holds its last value, as for an absent key
  }
  if (value === null) return { reason: 'absent' } as const;
  const siriCard = appConfigV1SiriCardValues.find((candidate) => candidate === value);
  return siriCard ? { siriCard } : { reason: 'malformed' } as const;
}

/**
 * Every request reads KV once, with no cache in front, so a switch applies at once. KV reads
 * therefore equal app-config requests, which the Worker's own daily request allowance bounds.
 */
export function createAppConfigHandler({ store }: Readonly<{ store: AppConfigStore }>) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return error(405, 'method_not_allowed', { Allow: 'GET' });
    const stored = await storedSiriCard(store);
    if (!('siriCard' in stored)) {
      console.warn({ event: 'app_config_unavailable', route: appConfigV1Path, reason: stored.reason });
      return error(503, 'unavailable');
    }
    return Response.json(appConfigV1SuccessSchema.parse({ data: { siriCard: stored.siriCard } }), { headers: jsonHeaders });
  };
}
