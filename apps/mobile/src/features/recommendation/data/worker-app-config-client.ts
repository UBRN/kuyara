import { appConfigV1Path, appConfigV1SuccessSchema } from '@kuyara/contracts';

import type { SiriCardSwitch } from '@/features/recommendation/application/siri-card-switch';
import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';

/**
 * The Worker's Siri card switch, a value this binary does not know read as on, or null for any
 * failure (no network, an error status, a body the contract rejects), which keeps the last value.
 */
export async function fetchSiriCardSwitch(baseUrl: string, send: Fetch = globalThis.fetch): Promise<SiriCardSwitch | null> {
  try {
    const { response, body } = await fetchJsonWithTimeout(send, `${baseUrl}${appConfigV1Path}`, { method: 'GET' }, 10000, {
      network: () => new Error('network'),
      invalidJson: () => new Error('invalid_response'),
    });
    const parsed = response.ok ? appConfigV1SuccessSchema.safeParse(body) : null;
    if (!parsed?.success) return null;
    const { siriCard } = parsed.data.data;
    return siriCard === 'unknown' ? 'on' : siriCard;
  } catch {
    return null; // no answer: the device keeps the last value it received
  }
}
