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
});

test('loaded mapping uses localized catalog names, slot order, positions, and first-only emphasis', () => {
  const english = loadedPresentation();

  assert.deepEqual(
    english.suggestions.map(({ id, positionLabel, title, emphasis }) => ({
      id,
      positionLabel,
      title,
      emphasis,
    })),
    [
      {
        id: 'outfit-1',
        positionLabel: 'Option 1 of 3',
        title: 'T-shirt + Shorts + Rain jacket + Weather boots',
        emphasis: 'Recommended',
      },
      {
        id: 'outfit-2',
        positionLabel: 'Option 2 of 3',
        title: 'Jumpsuit + Rain jacket + Weather boots',
        emphasis: undefined,
      },
      {
        id: 'outfit-3',
        positionLabel: 'Option 3 of 3',
        title: 'Blouse + Shorts + Rain jacket + Weather boots',
        emphasis: undefined,
      },
    ],
  );
  assert.deepEqual(english.suggestions[0].pieces, [
    { slot: 'Top', item: 'T-shirt' },
    { slot: 'Bottom', item: 'Shorts' },
    { slot: 'Outer layer', item: 'Rain jacket' },
    { slot: 'Footwear', item: 'Weather boots' },
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
    'Option 1 of 3. Top: T-shirt. Bottom: Shorts. Outer layer: Rain jacket. Footwear: Weather boots. Why it works: Strong wind requires wind protection. Likely precipitation requires water protection. Drizzle calls for light water protection. Rain requires water protection.',
  );
  assert.equal(
    turkish.suggestions[0].accessibilityLabel,
    '3 seçenekten birincisi. Üst: Tişört. Alt: Şort. Dış katman: Yağmurluk. Ayakkabı: Hava koşullarına uygun bot. Bu kombin şu nedenlerle uygun: Kuvvetli rüzgâr, rüzgâr koruması gerektiriyor. Beklenen yağış su koruması gerektiriyor. Çiseleme hafif su koruması gerektiriyor. Yağmur su koruması gerektiriyor.',
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

test('stale freshness and fewer than six current-or-future rain entries localize in both languages', () => {
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
    english.weather.hourlyRainProbability.map(({ label, probabilityPercent }) => ({
      label,
      probabilityPercent,
    })),
    [
      { label: '09:00', probabilityPercent: 65 },
      { label: '10:00', probabilityPercent: 45 },
      { label: '11:00', probabilityPercent: 20 },
    ],
  );
  assert.deepEqual(
    turkish.suggestions.map(({ title }) => title),
    [
      'Tişört + Şort + Yağmurluk + Hava koşullarına uygun bot',
      'Tulum + Yağmurluk + Hava koşullarına uygun bot',
      'Bluz + Şort + Yağmurluk + Hava koşullarına uygun bot',
    ],
  );
  assert.equal(english.header.location, 'Sample İstanbul');
  assert.equal(turkish.header.location, 'Örnek İstanbul');
  assert.equal(english.weather.condition, 'Rain');
  assert.equal(turkish.weather.condition, 'Yağmurlu');
  assert.equal(
    english.weather.hourlyRainProbability[0].accessibilityLabel,
    '09:00. 65% chance of rain',
  );
  assert.equal(
    turkish.weather.hourlyRainProbability[0].accessibilityLabel,
    'Saat 09:00 için yağmur olasılığı yüzde 65.',
  );
  assert.equal(
    english.weather.metricsAccessibilityLabel,
    'Wind: 8 m/s. Humidity: 78%. UV: 2',
  );
  assert.equal(
    turkish.weather.metricsAccessibilityLabel,
    'Rüzgâr hızı saniyede 8 metre. Nem yüzde 78. UV endeksi 2.',
  );
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
