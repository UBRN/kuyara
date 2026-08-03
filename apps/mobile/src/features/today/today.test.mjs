import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalTodayFixture, canonicalTodayScreenState } from './fixtures.ts';
import { isCompleteOutfit } from './model.ts';
import { createTodayPresentation } from './presentation/today-presentation.ts';
import { messages } from '../../localization/messages.ts';
import { createKuyaraTheme } from '../../theme/theme.ts';

const featureSource = async () => {
  const files = [
    './fixtures.ts',
    './model.ts',
    './presentation/today-presentation.ts',
    './presentation/today-screen.tsx',
    './presentation/weather-card.tsx',
    './presentation/weather-glyph.tsx',
    './presentation/outfit-suggestion-card.tsx',
    './presentation/outfit-detail-screen.tsx',
  ];

  return Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
};

test('canonical Today fixture is fixed, frozen, and contains realistic mock weather', () => {
  assert.equal(canonicalTodayFixture.id, 'today-istanbul-rain-001');
  assert.equal(canonicalTodayFixture.location, 'location.istanbul');
  assert.equal(canonicalTodayFixture.timeZone, 'Europe/Istanbul');
  assert.equal(canonicalTodayFixture.retrievedAt, '2026-03-18T05:30:00.000Z');
  assert.equal(canonicalTodayFixture.freshness, 'fresh');
  assert.deepEqual(canonicalTodayFixture.weather, {
    condition: 'weather.lightRain',
    temperatureCelsius: 14,
    apparentTemperatureCelsius: 12,
    minimumTemperatureCelsius: 10,
    maximumTemperatureCelsius: 17,
    precipitationProbabilityPercent: 45,
    windSpeedKmh: 18,
    windDirection: 'NE',
    humidityPercent: 78,
    uvIndex: 2,
    sunriseTime: '06:42',
    sunsetTime: '19:15',
    hourlyRainProbability: [
      { label: '6a', probabilityPercent: 15 },
      { label: '9a', probabilityPercent: 60 },
      { label: '12p', probabilityPercent: 50 },
      { label: '3p', probabilityPercent: 25 },
      { label: '6p', probabilityPercent: 12 },
      { label: '9p', probabilityPercent: 6 },
    ],
  });
  assert.equal(Object.isFrozen(canonicalTodayFixture), true);
  assert.equal(Object.isFrozen(canonicalTodayFixture.weather), true);
});

test('fixture exposes exactly three unique and complete outfit suggestions', () => {
  const suggestions = canonicalTodayFixture.suggestions;
  const ids = suggestions.map(({ id }) => id);

  assert.equal(suggestions.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(
    suggestions.map(({ intent }) => intent),
    ['outfit.comfortable', 'outfit.polished', 'outfit.rainReady'],
  );
  assert.equal(suggestions.every(isCompleteOutfit), true);
  assert.equal(suggestions.every(({ pieces }) => pieces.length >= 4), true);
});

test('all fixture codes resolve in English and Turkish without fixture prose', () => {
  for (const language of ['en', 'tr']) {
    const copy = messages[language].today;

    assert.ok(copy.locations[canonicalTodayFixture.location]);
    assert.ok(copy.conditions[canonicalTodayFixture.weather.condition]);
    assert.ok(copy.strategies[canonicalTodayFixture.strategy]);

    for (const suggestion of canonicalTodayFixture.suggestions) {
      assert.ok(copy.outfits[suggestion.intent].title);
      assert.ok(copy.outfits[suggestion.intent].description);
      if (suggestion.emphasis) {
        assert.ok(copy.emphasis[suggestion.emphasis]);
      }
      for (const piece of suggestion.pieces) {
        assert.ok(copy.slots[piece.slot]);
        assert.ok(copy.items[piece.item]);
      }
      for (const reason of suggestion.reasons) {
        assert.ok(copy.reasons[reason]);
      }
    }
  }
});

test('loaded presentation localizes weather, guidance, freshness, and all three visible outfits', () => {
  const english = createTodayPresentation(canonicalTodayScreenState, 'en');
  const turkish = createTodayPresentation(canonicalTodayScreenState, 'tr');

  assert.equal(english.kind, 'loaded');
  assert.equal(turkish.kind, 'loaded');
  assert.equal(english.copy.title, 'Today');
  assert.equal(turkish.copy.title, 'Bugün');
  assert.equal(english.header.location, 'İstanbul');
  assert.equal(turkish.header.location, 'İstanbul');
  assert.match(english.header.freshness, /08:30/);
  assert.match(turkish.header.freshness, /08:30/);
  assert.equal(english.weather.temperature, '14°');
  assert.match(english.weather.accessibilityLabel, /14 degrees Celsius/);
  assert.match(turkish.weather.accessibilityLabel, /14 santigrat derece/);
  assert.equal(english.suggestions.length, 3);
  assert.equal(turkish.suggestions.length, 3);
  assert.deepEqual(
    english.suggestions.map(({ title }) => title),
    ['Comfortable', 'Polished', 'Rain-ready'],
  );
  assert.deepEqual(
    turkish.suggestions.map(({ title }) => title),
    ['Rahat', 'Özenli', 'Yağmura hazır'],
  );
  assert.equal(english.suggestions.every(({ accessibilityLabel }) => accessibilityLabel.length > 80), true);
});

test('loading, unavailable, and stale presentation states remain explicit and local', () => {
  const loading = createTodayPresentation({ kind: 'loading' }, 'en');
  const unavailable = createTodayPresentation({ kind: 'unavailable' }, 'tr');
  const stale = createTodayPresentation(
    {
      kind: 'loaded',
      snapshot: { ...canonicalTodayFixture, freshness: 'stale' },
    },
    'en',
  );

  assert.equal(loading.kind, 'loading');
  assert.match(loading.accessibilityLabel, /loading/i);
  assert.equal(unavailable.kind, 'unavailable');
  assert.match(unavailable.title, /kullanılamıyor/);
  assert.equal(stale.kind, 'loaded');
  assert.equal(stale.header.isStale, true);
  assert.match(stale.header.freshness, /out of date/i);
});

test('Today presentation resolves on both semantic themes without motion-dependent information', () => {
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');
  const reduced = createKuyaraTheme('light', true);

  assert.notEqual(light.colors.background, dark.colors.background);
  assert.ok(light.colors.textPrimary);
  assert.ok(dark.colors.textPrimary);
  assert.equal(Object.values(reduced.motion).every((duration) => duration === 0), true);
});

test('weather glyph animation respects Reduce Motion instead of looping unconditionally', async () => {
  const glyphSource = await readFile(
    new URL('./presentation/weather-glyph.tsx', import.meta.url),
    'utf8',
  );

  assert.match(glyphSource, /isReduceMotionEnabled/);
  assert.match(glyphSource, /withRepeat/);
});

test('screen source keeps all suggestions in the vertical flow with large-text and accessibility contracts', async () => {
  const [todayScreen, weatherCard, outfitCard] = await Promise.all([
    readFile(new URL('./presentation/today-screen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./presentation/weather-card.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./presentation/outfit-suggestion-card.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(todayScreen, /otherSuggestions\.map/);
  assert.match(todayScreen, /testID="today-outfit-list"/);
  assert.doesNotMatch(todayScreen, /horizontal|FlatList|carousel|show more/i);
  assert.match(weatherCard, /fontScale > 1\.5/);
  assert.match(outfitCard, /fontScale > 1\.5/);
  assert.match(todayScreen, /accessibilityLabel=\{presentation\.weather\.accessibilityLabel\}/);
  assert.match(outfitCard, /accessibilityLabel=\{suggestion\.accessibilityLabel\}/);
  assert.doesNotMatch(`${todayScreen}${weatherCard}${outfitCard}`, /numberOfLines=|allowFontScaling=\{false\}/);
});

test('feature and route sources contain no live-data or experimental navigation integration', async () => {
  const sources = await featureSource();
  const route = await readFile(new URL('../../app/(tabs)/(today)/index.tsx', import.meta.url), 'utf8');
  const detailRoute = await readFile(new URL('../../app/(tabs)/(today)/[id].tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  const tabs = await readFile(new URL('../../navigation/primary-tabs.tsx', import.meta.url), 'utf8');
  const combined = `${sources.join('\n')}\n${route}\n${detailRoute}\n${layout}\n${tabs}`;

  assert.doesNotMatch(combined, /Date\.now|Math\.random|fetch\(|axios|WeatherKit|SQLite|location permission|openai|anthropic/i);
  assert.match(route, /canonicalTodayScreenState/);
  assert.match(detailRoute, /canonicalTodayScreenState/);
  assert.match(layout, /<Stack/);
  assert.match(tabs, /<Tabs/);
  assert.doesNotMatch(`${layout}${tabs}`, /NativeTabs|unstable-native-tabs/);
});
