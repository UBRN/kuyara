import { z } from 'zod';

import { fetchJsonWithTimeout } from '@/infrastructure/network/fetch-json-with-timeout';
import type { SupportedLanguage } from '@/localization/messages';

const baseUrl = 'https://weatherkit.apple.com';
const relativePath = z.string().regex(/^\/[^/]/);
const attributionSchema = z.object({
  'logoLight@1x': relativePath,
  'logoLight@2x': relativePath,
  'logoLight@3x': relativePath,
  'logoDark@1x': relativePath,
  'logoDark@2x': relativePath,
  'logoDark@3x': relativePath,
});
type Attribution = z.infer<typeof attributionSchema>;

const cached = new Map<SupportedLanguage, Promise<Attribution>>();

export async function appleWeatherMarkUrl(
  language: SupportedLanguage,
  isDark: boolean,
  pixelRatio: number,
  fetchAttribution: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  let request = cached.get(language);
  if (!request) {
    request = loadAttribution(language, fetchAttribution);
    cached.set(language, request);
    // A failed load is not kept, so the next read retries instead of showing the caption until restart.
    const failed = request;
    failed.catch(() => {
      if (cached.get(language) === failed) cached.delete(language);
    });
  }
  const attribution = await request;
  const appearance = isDark ? 'Dark' : 'Light';
  const scale = pixelRatio >= 2.5 ? 3 : pixelRatio >= 1.5 ? 2 : 1;
  const path = attribution[`logo${appearance}@${scale}x`];
  return new URL(path, baseUrl).toString();
}

async function loadAttribution(
  language: SupportedLanguage,
  fetchAttribution: typeof globalThis.fetch,
): Promise<Attribution> {
  const { response, body } = await fetchJsonWithTimeout(
    fetchAttribution,
    `${baseUrl}/attribution/${language}`,
    {},
    5000,
    { network: (cause) => cause, invalidJson: () => new Error('Attribution unavailable') },
  );
  if (!response.ok) throw new Error('Attribution unavailable');
  return attributionSchema.parse(body);
}
