// The prompts a Haiku or Workers AI attempt is priced on: the largest the tree's composition
// builds, measured on the days the tests pin, and the largest each installed store build sends.
// Every store build adds its largest request here as an `installed-build-<build>-largest-request.json`
// fixture before it ships, because a binary keeps its composition while the tree moves on.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { aiRecommendV2RequestSchema, type AiRecommendV1Request } from '@kuyara/contracts';

import { haikuPromptCharacters } from '../haiku-ai-provider.ts';

// The shared grid is a plain `.mjs` module without declarations, so it is imported through
// a variable specifier and given the one shape this module reads.
type GridModule = {
  gridRequestCells(): { request: AiRecommendV1Request | null }[];
  gridRecommendationInput(weatherKey: string, clothingPreference: string, dressStyle: string): object;
};
type ContextModule = {
  createRecommendationContext(input: unknown, localDayKey: string): unknown;
  aiRequestFromContext(context: unknown): AiRecommendV1Request | null;
};
const gridResolverSpecifier = '../../../../mobile/test/node-typescript-resolver.mjs';
const gridSpecifier = '../../../../mobile/test/recommendation-grid.mjs';
const contextSpecifier = '../../../../mobile/src/features/recommendation/application/recommendation-context.ts';

/** The largest prompt a request builds as a weekday, a weekend or with no day kind, in either locale. */
function largestOf(request: AiRecommendV1Request): number {
  const { dayKind: _dayKind, ...body } = request;
  return Math.max(...[{ dayKind: 'weekday' as const }, { dayKind: 'weekend' as const }, {}].flatMap((day) =>
    (['en', 'tr'] as const).map((locale) => haikuPromptCharacters({ ...body, ...day, locale }))));
}

// The grid has no cold front, and the longest prompts the app builds come from one: a day that
// is warm enough for light clothing in the morning and turns to wind and drizzle near freezing
// feel by the afternoon, so both ends of the wardrobe stay eligible. The wind stays below the
// 8 m/s that leaves the umbrella at home, so the outfits still carry it.
const now = '2026-09-19T09:00:00.000Z';
const weather = (temperatureCelsius: number, apparentTemperatureCelsius: number, condition: string,
  precipitationProbability: number, windSpeedMetersPerSecond: number) => ({
  temperatureCelsius, apparentTemperatureCelsius, condition, precipitationProbability, windSpeedMetersPerSecond,
  humidity: 0.8, uvIndex: 0,
});
const hour = (at: string, ...values: Parameters<typeof weather>) =>
  ({ forecastAt: `2026-09-19T${at}:00:00.000Z`, ...weather(...values) });
const coldFront = {
  id: 'weather-cold-front', localProfileId: 'profile', locationKey: 'manual:sample', timeZone: 'UTC', fetchedAt: now,
  origin: { kind: 'sample', sourceId: 'haiku-size' }, current: { observedAt: now, ...weather(20, 22, 'cloudy', 0.2, 3) },
  minimumTemperatureCelsius: 7, maximumTemperatureCelsius: 21,
  hourly: [
    hour('10', 21, 23, 'cloudy', 0.2, 3), hour('11', 21, 23, 'cloudy', 0.3, 4), hour('12', 17, 16, 'cloudy', 0.4, 6),
    hour('13', 12, 9, 'drizzle', 0.5, 7), hour('14', 9, 4, 'drizzle', 0.5, 7), hour('15', 8, 3, 'drizzle', 0.5, 7),
    hour('16', 8, 4, 'drizzle', 0.4, 6),
  ],
};

/**
 * Each priced prompt, and the largest of them. The offer rotates with the dressing day's own
 * count, so the tree's prompt changes from day to day and its yearly maximum moves from year to
 * year: the two dated days are the largest a sweep of 2026 found for the grid and the cold
 * front, three day kinds and both locales, and they pin the tree's composition, not every year.
 * The installed builds bound what a shipped binary sends.
 */
export async function pricedPrompts() {
  await import(gridResolverSpecifier);
  const { gridRequestCells, gridRecommendationInput } = (await import(gridSpecifier)) as GridModule;
  const { createRecommendationContext, aiRequestFromContext } = (await import(contextSpecifier)) as ContextModule;
  const built = (input: object, localDayKey: string) => {
    const request = aiRequestFromContext(createRecommendationContext({ ...input, localDayKey }, localDayKey));
    if (!request) throw new Error(`No AI request on ${localDayKey}.`);
    return request;
  };
  // The grid models a weekday caller; `largestOf` adds the weekend, no day kind and both locales.
  const grid = Math.max(...gridRequestCells()
    .filter((cell): cell is { request: AiRecommendV1Request } => cell.request !== null)
    .map(({ request }) => largestOf(request)));
  const datedGrid = largestOf(built(gridRecommendationInput('cold_rain', 'womens', 'casual'), '2026-03-28'));
  // A weekend, day variants 3 and 4, which the app always pairs with a weekend day kind.
  const coldFrontWeekend = Math.max(...(['womens', 'mens'] as const).flatMap((clothingPreference) =>
    [3, 4].flatMap((dayVariant) => {
      const request = built({ snapshot: coldFront, now, clothingPreference, dressStyle: 'casual', dayVariant,
        dayKind: 'weekend' }, '2026-09-19');
      return (['en', 'tr'] as const).map((locale) => haikuPromptCharacters({ ...request, locale }));
    })));
  const datedColdFront = largestOf(built({ snapshot: coldFront, now, clothingPreference: 'womens',
    dressStyle: 'casual', dayVariant: 3, dayKind: 'weekday' }, '2026-11-25'));
  const installed = Object.fromEntries(readdirSync(import.meta.dirname)
    .filter((name) => /^installed-build-\d+-largest-request\.json$/.test(name))
    .map((name) => {
      const request = aiRecommendV2RequestSchema.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, name), 'utf8')));
      return [name.match(/\d+/)![0], haikuPromptCharacters(request)];
    }));
  const largest = Math.max(grid, datedGrid, coldFrontWeekend, datedColdFront, ...Object.values(installed));
  return { grid, datedGrid, coldFrontWeekend, datedColdFront, installed, largest };
}
