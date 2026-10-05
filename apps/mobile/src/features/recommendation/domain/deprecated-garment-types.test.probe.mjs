// Run by deprecated-garment-types.test.mjs in a process started with module mocks enabled: the
// shipped catalog has no deprecated garment type yet, so this builds the catalog as it reads once
// one is. It reads what the recommendation domain offers on the real catalog, deprecates the
// pieces it offered, reads again, and prints both as JSON.
import { mock } from 'node:test';

const catalogUrl = new URL('../../catalog/domain/garment-catalog.ts', import.meta.url).href;
const actual = await import(catalogUrl);

const deprecatedIds = new Set();
const typesNow = () => actual.garmentCatalog.garmentTypes.map((type) =>
  deprecatedIds.has(type.typeId) ? { ...type, status: 'deprecated' } : type);
const offeredBy = (preference, onlyActive) => typesNow().filter(({ status, apparelPreferenceApplicability }) =>
  (!onlyActive || status === 'active') && apparelPreferenceApplicability.includes(preference));
mock.module(catalogUrl, {
  namedExports: {
    ...actual,
    garmentCatalog: {
      catalogVersion: actual.garmentCatalog.catalogVersion,
      get garmentTypes() { return typesNow(); },
    },
    getGarmentType: (typeId) => typesNow().find((type) => type.typeId === typeId) ?? null,
    listGarmentTypesForPreference: (preference) => offeredBy(preference, false),
    listSelectableGarmentTypes: (preference) => preference === null
      ? typesNow().filter(({ status }) => status === 'active')
      : offeredBy(preference, true),
  },
});

const { recommendOutfits, composeOutfitPool } = await import('../application/recommend-outfits.ts');
const { slotCandidates, pinPieces, outfitGarments } = await import('./manual-mix.ts');
const { accessoryCandidates } = await import('./manual-accessories.ts');

function day(temperatureCelsius) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition: 'clear',
    precipitationProbability: 0, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'probe' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}
function recommended(preference, temperatureCelsius, dayVariant) {
  const snapshot = day(temperatureCelsius);
  const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant });
  return { outfits: result.outfits, requirements: result.requirements };
}
const garmentsOf = (outfits) => outfits.flatMap((outfit) => Object.values(outfitGarments(outfit)));

// What each read needs, taken once from the real catalog.
const women = recommended('womens', 20, 0);
const dressed = women.outfits[1];
const pin = [{ slot: 'primary_top', garmentTypeId: 'sweater' }];
const footwearOffered = slotCandidates(dressed, 'footwear', women.requirements, 'womens')
  .map(({ garmentTypeId }) => garmentTypeId);
const bottomPicked = outfitGarments(pinPieces(dressed, pin, women.requirements, 'womens').outfit).bottom;
const accessoryOffered = Object.values(accessoryCandidates(women.requirements, 'womens'))
  .flat().map(({ garmentTypeId }) => garmentTypeId);

// Deprecate a footwear piece the outfit is not wearing, the bottom the pin search picked, and an
// accessory, then read the same things again.
const wornFootwear = outfitGarments(dressed).footwear;
const deprecatedFootwear = footwearOffered.findLast((typeId) => typeId !== wornFootwear);
for (const typeId of [deprecatedFootwear, bottomPicked, accessoryOffered[0]]) deprecatedIds.add(typeId);

const results = {};
function record(name, read) {
  try {
    results[name] = { offered: read() };
  } catch (error) {
    results[name] = { thrown: String(error?.message ?? error) };
  }
}
record('recommendation', () => garmentsOf(recommended('mens', 16, 1).outfits));
record('pool', () => garmentsOf(composeOutfitPool(women.requirements, 'womens', 2).outfits));
record('footwear candidates', () => slotCandidates(dressed, 'footwear', women.requirements, 'womens')
  .map(({ garmentTypeId }) => garmentTypeId));
record('best remaining bottom', () => Object.values(outfitGarments(
  pinPieces(dressed, pin, women.requirements, 'womens').outfit)));
record('accessory candidates', () => Object.values(accessoryCandidates(women.requirements, 'womens'))
  .flat().map(({ garmentTypeId }) => garmentTypeId));

console.log(JSON.stringify({ deprecated: [...deprecatedIds], results }));
