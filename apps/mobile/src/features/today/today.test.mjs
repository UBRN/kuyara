import assert from 'node:assert/strict';
import test from 'node:test';

import {
  todayActiveLocation,
  todayScreenState,
  todayWardrobeItems,
  todayWeatherSnapshot,
} from './__tests__/fixtures.ts';
import { createTodayPresentation } from './presentation/today-presentation.ts';
import { createKuyaraTheme } from '../../theme/theme.ts';

const weatherReasons = [
  'Strong wind requires wind protection.',
  'Likely precipitation requires water protection.',
  'Drizzle calls for light water protection.',
  'Rain requires water protection.',
];

function loadedPresentation(state = todayScreenState, language = 'en') {
  const presentation = createTodayPresentation(state, language);
  assert.equal(presentation.kind, 'loaded');
  return presentation;
}

function unavailableRecommendationState() {
  const { recommendation } = todayScreenState.snapshot;
  assert.equal(recommendation.status, 'recommended');

  return {
    kind: 'loaded',
    snapshot: {
      ...todayScreenState.snapshot,
      recommendation: {
        status: 'unavailable',
        requirements: recommendation.requirements,
        failure: {
          status: 'failure',
          reasonCodes: ['no_valid_composition'],
          missingSlots: [],
          unmetRequirements: [],
          bestObservedEvidence: [],
          consideredCandidateKeys: [],
        },
      },
    },
  };
}

test('test input is frozen, domain-shaped, and recommended through the real application function', () => {
  assert.equal(Object.isFrozen(todayWeatherSnapshot), true);
  assert.equal(Object.isFrozen(todayWeatherSnapshot.current), true);
  assert.equal(Object.isFrozen(todayWeatherSnapshot.hourly), true);
  assert.equal(Object.isFrozen(todayActiveLocation), true);
  assert.equal(Object.isFrozen(todayWardrobeItems), true);
  assert.equal(Object.isFrozen(todayWardrobeItems[0]), true);
  assert.equal(todayScreenState.snapshot.recommendation.status, 'recommended');
  assert.equal(todayScreenState.snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(
    todayScreenState.snapshot.recommendation.outfits.map(({ archetypeId }) => archetypeId),
    ['rain_ready', 'snow_day', 'wind_guard'],
  );
});

test('loaded mapping uses localized catalog names, slot order, positions, and first-only emphasis', () => {
  const english = loadedPresentation();

  assert.deepEqual(
    english.suggestions.map(({ id, positionLabel, title, summary, emphasis }) => ({
      id,
      positionLabel,
      title,
      summary,
      emphasis,
    })),
    [
      {
        id: 'outfit-1',
        positionLabel: 'Option 1 of 3',
        title: 'Rain Ready',
        summary: 'T-shirt + Shorts + Rain jacket + Winter boots',
        emphasis: 'Recommended',
      },
      {
        id: 'outfit-2',
        positionLabel: 'Option 2 of 3',
        title: 'Snow Day',
        summary: 'Jumpsuit + Rain jacket + Winter boots',
        emphasis: undefined,
      },
      {
        id: 'outfit-3',
        positionLabel: 'Option 3 of 3',
        title: 'Wind Guard',
        summary: 'Blouse + Shorts + Rain jacket + Winter boots',
        emphasis: undefined,
      },
    ],
  );
  assert.deepEqual(english.suggestions[0].pieces, [
    { slot: 'Top', item: 'T-shirt', category: 'top', garmentTypeId: 't_shirt' },
    { slot: 'Bottom', item: 'Shorts', category: 'bottom', garmentTypeId: 'shorts' },
    { slot: 'Outer layer', item: 'Rain jacket', category: 'outerwear', garmentTypeId: 'rain_jacket' },
    { slot: 'Footwear', item: 'Winter boots', category: 'footwear', garmentTypeId: 'weather_boots' },
  ]);
  assert.equal(
    english.suggestions.every(({ reasons }) =>
      weatherReasons.every((reason, index) => reasons[index] === reason),
    ),
    true,
  );
});

test('shared weather reasons lead every outfit and per-outfit composition reasons follow', () => {
  const english = loadedPresentation();
  const turkish = loadedPresentation(todayScreenState, 'tr');

  assert.deepEqual(english.suggestions[0].reasons, weatherReasons);
  assert.deepEqual(english.suggestions[1].reasons, [
    ...weatherReasons,
    'This outfit is warmer than required.',
  ]);
  assert.equal(
    english.suggestions[0].accessibilityLabel,
    'Option 1 of 3. Rain Ready. Top: T-shirt. Bottom: Shorts. Outer layer: Rain jacket. Footwear: Winter boots. Why it works: Strong wind requires wind protection. Likely precipitation requires water protection. Drizzle calls for light water protection. Rain requires water protection.',
  );
  assert.equal(
    turkish.suggestions[0].accessibilityLabel,
    '3 seçenekten birincisi. Yağmura Hazır. Üst: Tişört. Alt: Şort. Dış katman: Yağmurluk. Ayakkabı: Kışlık bot. Bu kombin şu nedenlerle uygun: Kuvvetli rüzgâr, rüzgâr koruması gerektiriyor. Beklenen yağış su koruması gerektiriyor. Çiseleme hafif su koruması gerektiriyor. Yağmur su koruması gerektiriyor.',
  );
});

test('an unavailable recommendation keeps the loaded weather presentation and exposes local no-outfit copy', () => {
  const english = loadedPresentation(unavailableRecommendationState());
  const turkish = loadedPresentation(unavailableRecommendationState(), 'tr');

  assert.deepEqual(english.suggestions, []);
  assert.deepEqual(english.noOutfit, {
    title: 'Outfit unavailable',
    body: 'No complete outfit can be recommended for these conditions.',
  });
  assert.deepEqual(turkish.noOutfit, {
    title: 'Kombin bulunamadı',
    body: 'Bu koşullar için eksiksiz bir kombin önerilemiyor.',
  });
  assert.equal(english.weather.temperature, '20°');
  assert.equal(turkish.weather.temperature, '20°');
});

test('stale freshness and outfit copy localize in both languages', () => {
  const staleState = {
    ...todayScreenState,
    snapshot: { ...todayScreenState.snapshot, freshness: 'stale' },
  };
  const english = loadedPresentation(staleState);
  const turkish = loadedPresentation(staleState, 'tr');

  assert.equal(english.header.isStale, true);
  assert.match(english.header.freshness, /09:05.*out of date/i);
  assert.match(turkish.header.freshness, /09:05.*Güncelliğini yitirmiş olabilir/);
  assert.deepEqual(
    turkish.suggestions.map(({ title }) => title),
    ['Yağmura Hazır', 'Karlı Gün', 'Rüzgara Karşı'],
  );
  assert.deepEqual(
    turkish.suggestions.map(({ summary }) => summary),
    [
      'Tişört + Şort + Yağmurluk + Kışlık bot',
      'Tulum + Yağmurluk + Kışlık bot',
      'Bluz + Şort + Yağmurluk + Kışlık bot',
    ],
  );
  assert.equal(english.header.location, 'Sample İstanbul');
  assert.equal(turkish.header.location, 'Örnek İstanbul');
  assert.equal(english.weather.condition, 'Rain');
  assert.equal(turkish.weather.condition, 'Yağmurlu');
});

test('loading, unavailable, and semantic theme behavior remains explicit', () => {
  const loading = createTodayPresentation({ kind: 'loading' }, 'en');
  const unavailable = createTodayPresentation({ kind: 'unavailable' }, 'tr');
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');
  const reduced = createKuyaraTheme('light', true);

  assert.equal(loading.kind, 'loading');
  assert.match(loading.accessibilityLabel, /loading/i);
  assert.equal(unavailable.kind, 'unavailable');
  assert.match(unavailable.title, /kullanılamıyor/);
  assert.notEqual(light.colors.background, dark.colors.background);
  assert.equal(Object.values(reduced.motion).every((duration) => duration === 0), true);
});

test('the freshness line reports refreshing, failure, staleness, and last update in that precedence', () => {
  const base = todayScreenState;

  const refreshing = loadedPresentation({ ...base, isRefreshing: true, refreshFailed: true });
  assert.equal(refreshing.header.freshness, 'Refreshing weather…');
  assert.equal(refreshing.header.isRefreshing, true);
  assert.equal(refreshing.header.announceFreshness, true);

  const failed = loadedPresentation({ ...base, isRefreshing: false, refreshFailed: true });
  assert.match(failed.header.freshness, /^Couldn't refresh · Showing last update from /);
  assert.equal(failed.header.isRefreshing, false);
  assert.equal(failed.header.announceFreshness, true);

  const settled = loadedPresentation({ ...base, isRefreshing: false, refreshFailed: false });
  assert.match(settled.header.freshness, /^Updated at |^Last updated at /);
  assert.equal(settled.header.announceFreshness, settled.header.isStale);

  const turkish = loadedPresentation({ ...base, isRefreshing: true, refreshFailed: false }, 'tr');
  assert.equal(turkish.header.freshness, 'Hava durumu yenileniyor…');
});

test('the refresh action label is localized and matches the Weather screen wording', () => {
  assert.equal(loadedPresentation().copy.refreshAction, 'Refresh weather');
  assert.equal(loadedPresentation(todayScreenState, 'tr').copy.refreshAction, 'Hava durumunu yenile');
});
