import { z } from 'zod';

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchAttribution(`${baseUrl}/attribution/${language}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Attribution unavailable');
    return attributionSchema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
