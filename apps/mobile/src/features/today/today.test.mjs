import assert from 'node:assert/strict';
import test from 'node:test';

import {
  todayActiveLocation,
  todayScreenState,
  todayWardrobeItems,
  todayWeatherSnapshot,
} from './__tests__/fixtures.ts';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from './presentation/today-presentation.ts';
import { recommendOutfits } from '../recommendation/application/recommend-outfits.ts';
import { createKuyaraTheme } from '../../theme/theme.ts';
import { composeGarmentBoard } from '../../components/ui/garment-board/compose-garment-board.ts';

const weatherReasons = [
  'Strong wind requires wind protection.',
  'Likely precipitation requires water protection.',
  'Drizzle calls for light water protection.',
  'Rain requires water protection.',
];
// `pnpm --filter @kuyara/mobile test` pins the device zone to UTC; the fixture location is
// Europe/Istanbul, so a label in UTC is the proof it followed the device and not the city.
const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');

function loadedPresentation(
  state = todayScreenState,
  language = 'en',
  hour12 = false,
  now = fixtureNow,
) {
  const presentation = createTodayPresentation(state, language, hour12, now);
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
        id: todayScreenState.snapshot.recommendation.outfits[0].optionId,
        positionLabel: 'Option 1 of 3',
        title: 'Rain Ready',
        summary: 'Jumpsuit + Rain jacket + Winter boots',
        emphasis: 'Recommended',
      },
      {
        id: todayScreenState.snapshot.recommendation.outfits[1].optionId,
        positionLabel: 'Option 2 of 3',
        title: 'Snow Day',
        summary: 'Blouse + Jeans + Rain jacket + Winter boots',
        emphasis: undefined,
      },
      {
        id: todayScreenState.snapshot.recommendation.outfits[2].optionId,
        positionLabel: 'Option 3 of 3',
        title: 'Wind Guard',
        summary: 'Blouse + Shorts + Rain jacket + Winter boots',
        emphasis: undefined,
      },
    ],
  );
  assert.deepEqual(english.suggestions[0].pieces, [
    { slot: 'One-piece', item: 'Jumpsuit', category: 'one_piece', garmentTypeId: 'jumpsuit' },
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

test('loaded presentation derives the atmosphere from the device clock, not fetch time', () => {
  const fetchedAtThreeInTheAfternoon = {
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      weather: {
        ...todayScreenState.snapshot.weather,
        fetchedAt: '2026-08-13T12:00:00.000Z',
      },
    },
  };

  assert.equal(loadedPresentation(todayScreenState).atmosphere, 'fallingDay');
  const night = loadedPresentation(
    fetchedAtThreeInTheAfternoon,
    'en',
    false,
    Date.parse('2026-08-13T19:00:00.000Z'),
  );
  assert.equal(night.atmosphere, 'fallingNight');
  // 12:00 UTC is 15:00 in the location's zone; the label reports the device's.
  assert.match(night.header.freshness, /12:00/);
});

test('loaded presentation gives visible and accessible weather the same rain outlook', () => {
  const highRainLaterToday = {
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      weather: {
        ...todayScreenState.snapshot.weather,
        current: {
          ...todayScreenState.snapshot.weather.current,
          precipitationProbability: 0.1,
        },
        hourly: [
          {
            ...todayScreenState.snapshot.weather.hourly[0],
            forecastAt: '2026-08-13T12:00:00.000Z',
            precipitationProbability: 0.9,
          },
          {
            ...todayScreenState.snapshot.weather.hourly[0],
            forecastAt: '2026-08-13T22:00:00.000Z',
            precipitationProbability: 1,
          },
        ],
      },
    },
  };

  const presentation = loadedPresentation(highRainLaterToday);
  assert.equal(presentation.weather.rainProbability, '90% chance of rain');
  assert.match(presentation.weather.accessibilityLabel, /90 percent chance of rain/);
});

function assignedGarment(slot, garmentTypeId, category) {
  return {
    slot,
    layerRole: null,
    garment: { garmentTypeId, properties: { category } },
    eligibilityScore: 0,
    evaluations: [],
  };
}

test('pieces keep mid layer before outer layer even though the board paints outer before mid', () => {
  const outfitWithMidAndOuter = {
    optionId: 'test-outfit',
    archetypeId: 'layered_warmth',
    body: {
      kind: 'one_piece',
      onePiece: assignedGarment('one_piece', 'jumpsuit', 'one_piece'),
    },
    midLayer: assignedGarment('mid_layer', 'sweater', 'top'),
    outerLayer: assignedGarment('outer_layer', 'rain_jacket', 'outerwear'),
    footwear: assignedGarment('footwear', 'weather_boots', 'footwear'),
    requirementEvaluations: [],
    reasonCodes: [],
  };
  const state = {
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      recommendation: {
        ...todayScreenState.snapshot.recommendation,
        outfits: [outfitWithMidAndOuter],
      },
    },
  };

  const outfit = loadedPresentation(state).suggestions[0];

  assert.deepEqual(outfit.pieces.map(({ slot }) => slot), [
    'One-piece', 'Mid layer', 'Outer layer', 'Footwear',
  ]);
  assert.deepEqual(outfit.boardPieces.map(({ slot }) => slot), [
    'one_piece', 'mid_layer', 'outer_layer', 'footwear',
  ]);

  const board = composeGarmentBoard(outfit.boardPieces.map((piece) => ({
    slot: piece.slot,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  })));

  assert.deepEqual(board.order.map(({ slot }) => slot), [
    'one_piece', 'outer_layer', 'mid_layer', 'footwear',
  ]);
});

test('shared weather reasons lead every outfit and per-outfit composition reasons follow', () => {
  const english = loadedPresentation();
  const turkish = loadedPresentation(todayScreenState, 'tr');

  assert.deepEqual(english.suggestions[0].reasons, weatherReasons);
  assert.deepEqual(english.suggestions[1].reasons, weatherReasons);
  assert.equal(
    english.suggestions[0].accessibilityLabel,
    'Option 1 of 3. Rain Ready. One-piece: Jumpsuit. Outer layer: Rain jacket. Footwear: Winter boots. Why it works: Strong wind requires wind protection. Likely precipitation requires water protection. Drizzle calls for light water protection. Rain requires water protection.',
  );
  assert.equal(
    turkish.suggestions[0].accessibilityLabel,
    '3 seçenekten birincisi. Yağmura Hazır. Tek parça: Tulum. Dış katman: Yağmurluk. Ayakkabı: Kışlık bot. Bu kombin şu nedenlerle uygun: Kuvvetli rüzgâr, rüzgâr koruması gerektiriyor. Beklenen yağış su koruması gerektiriyor. Çiseleme hafif su koruması gerektiriyor. Yağmur su koruması gerektiriyor.',
  );
});

// A day whose measurements ask for nothing: no clothing requirement is derived, so the
// only reason codes left are the two that do not come from a requirement.
const mildMeasurements = {
  temperatureCelsius: 20,
  apparentTemperatureCelsius: 20,
  condition: 'clear',
  precipitationProbability: 0,
  windSpeedMetersPerSecond: 0,
};
const mildWeather = {
  ...todayWeatherSnapshot,
  current: { ...todayWeatherSnapshot.current, ...mildMeasurements },
  minimumTemperatureCelsius: 20,
  maximumTemperatureCelsius: 20,
  hourly: [{ ...todayWeatherSnapshot.hourly[0], ...mildMeasurements }],
};

function mildPresentation(weather, now, language = 'en') {
  const recommendation = recommendOutfits({
    snapshot: weather,
    now,
    clothingPreference: 'womens',
    dayVariant: 0,
  });
  assert.equal(recommendation.status, 'recommended');
  assert.deepEqual(recommendation.requirements.requirements, []);

  return {
    recommendation,
    presentation: loadedPresentation({
      ...todayScreenState,
      snapshot: { ...todayScreenState.snapshot, weather, recommendation },
    }, language),
  };
}

test('a mild clear day still gives the primary outfit a rationale', () => {
  const { recommendation, presentation } = mildPresentation(mildWeather, undefined);

  assert.equal(recommendation.outfits[0].penaltyPoints, 0);
  assert.deepEqual(presentation.suggestions[0].reasons, [
    'The daily temperature range is based on current conditions.',
  ]);
});

test('a mild day with a live forecast falls back to the deterministic status sentence', () => {
  // A forecast hour still ahead of `now` removes the daily-extrema fallback reason, which
  // is the last sentence a mild day produces, so the rationale line would render empty.
  const liveForecast = {
    ...mildWeather,
    hourly: [{ ...mildWeather.hourly[0], forecastAt: '2026-08-13T07:00:00.000Z' }],
  };
  const now = todayWeatherSnapshot.current.observedAt;
  const { recommendation, presentation } = mildPresentation(liveForecast, now);

  assert.deepEqual(recommendation.requirements.reasonCodes, []);
  assert.deepEqual(recommendation.outfits[0].reasonCodes, []);
  assert.deepEqual(presentation.suggestions[0].reasons, [
    'Nothing in today’s weather asks for special protection.',
  ]);
  assert.deepEqual(
    mildPresentation(liveForecast, now, 'tr').presentation.suggestions[0].reasons,
    ['Bugünkü hava özel bir koruma istemiyor.'],
  );
});

test('every generation mode has its own localized accessible generation mark', () => {
  const recommendation = todayScreenState.snapshot.recommendation;
  assert.equal(recommendation.status, 'recommended');

  for (const [generationMode, label, showsAiMark] of [
    // No icon of any kind beside the Apple word mark.
    ['on-device-ai', 'Chosen on your device with Apple Intelligence', false],
    ['ai-assisted', 'AI-assisted', true],
    ['deterministic-fallback', 'Standard suggestions', false],
  ]) {
    const presentation = loadedPresentation({
      ...todayScreenState,
      snapshot: {
        ...todayScreenState.snapshot,
        recommendation: { ...recommendation, generationMode },
      },
    });
    assert.deepEqual(presentation.generationMode, {
      label,
      accessibilityLabel: `Recommendation source: ${label}`,
      showsAiMark,
    });
  }
});

test('detail reasoning groups garments by requirement and localizes trade-offs as rows', () => {
  const english = loadedPresentation();
  assert.deepEqual(english.suggestions[0].requirementRows, [
    {
      id: 'wind_protection',
      kind: 'reason',
      text: 'Wind protection: Rain jacket.',
    },
    {
      id: 'body_water_protection',
      kind: 'reason',
      text: 'Body water protection: Rain jacket.',
    },
    {
      id: 'footwear_water_protection',
      kind: 'reason',
      text: 'Footwear water protection: Winter boots.',
    },
  ]);

  const recommendation = todayScreenState.snapshot.recommendation;
  assert.equal(recommendation.status, 'recommended');
  const first = recommendation.outfits[0];
  const tradeoffState = {
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      recommendation: {
        ...recommendation,
        outfits: [{
          ...first,
          requirementEvaluations: [{
            ...first.requirementEvaluations[0],
            requirement: {
              kind: 'breathability', minimum: 'high', priority: 'mandatory',
              reasonCodes: ['temperature_high'],
            },
            status: 'tradeoff',
            suppliedByCandidateKeys: [],
            tradeoffCandidateKeys: ['catalog:rain_jacket'],
          }],
        }],
      },
    },
  };

  assert.deepEqual(loadedPresentation(tradeoffState).suggestions[0].requirementRows, [{
    id: 'breathability',
    kind: 'tradeoff',
    text: 'Trade-off (Breathability): Rain jacket.',
  }]);
  assert.equal(
    loadedPresentation(tradeoffState, 'tr').suggestions[0].requirementRows[0].text,
    'Denge (Nefes alabilirlik): Yağmurluk.',
  );
});

test('detail caption geometry centers each cap on the piece axis and clamps it inside the board', () => {
  assert.deepEqual(
    createDetailCaptionLayout(
      { slot: 'one_piece', garmentTypeId: 'dress', x: 100, y: 20, width: 80, height: 100 },
      360,
    ),
    { left: 64.4, top: 127, width: 151.2 },
  );
  assert.deepEqual(
    createDetailCaptionLayout(
      { slot: 'outer_layer', garmentTypeId: 'rain_jacket', x: 330, y: 30, width: 30, height: 70 },
      360,
    ),
    { left: 252, top: 107, width: 108 },
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
  // 06:05 UTC, the device clock, where the location's zone would read 09:05.
  assert.match(english.header.freshness, /06:05.*out of date/i);
  assert.match(turkish.header.freshness, /06:05.*Güncelliğini yitirmiş olabilir/);
  assert.deepEqual(
    turkish.suggestions.map(({ title }) => title),
    ['Yağmura Hazır', 'Karlı Gün', 'Rüzgara Karşı'],
  );
  assert.deepEqual(
    turkish.suggestions.map(({ summary }) => summary),
    [
      'Tulum + Yağmurluk + Kışlık bot',
      'Bluz + Kot pantolon + Yağmurluk + Kışlık bot',
      'Bluz + Şort + Yağmurluk + Kışlık bot',
    ],
  );
  assert.equal(english.header.location, 'Istanbul');
  assert.equal(turkish.header.location, 'Istanbul');
  assert.equal(english.weather.condition, 'Rain');
  assert.equal(turkish.weather.condition, 'Yağmurlu');
});

test('loading, unavailable, and semantic theme behavior remains explicit', () => {
  const loading = createTodayPresentation({ kind: 'loading' }, 'en', false, fixtureNow);
  const unavailable = createTodayPresentation({ kind: 'unavailable' }, 'tr', false, fixtureNow);
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');
  const reduced = createKuyaraTheme('light', true);

  assert.equal(loading.kind, 'loading');
  assert.match(loading.accessibilityLabel, /loading/i);
  assert.equal(unavailable.kind, 'unavailable');
  assert.match(unavailable.title, /kullanılamıyor/);
  assert.notEqual(light.colors.background, dark.colors.background);
  assert.equal(
    Object.values(reduced.motion)
      .flatMap((role) => (typeof role === 'number' ? role : Object.values(role)))
      .every((duration) => duration === 0),
    true,
  );
});

test('the freshness line reports refreshing, failure, staleness, and last update in that precedence', () => {
  const base = todayScreenState;

  const refreshing = loadedPresentation({ ...base, isRefreshing: true, refreshFailed: true });
  assert.equal(refreshing.header.freshness, 'Refreshing today’s guidance…');
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
  assert.equal(turkish.header.freshness, 'Bugünün önerileri yenileniyor…');
  assert.equal(turkish.header.phase, null);
});

// The wait can now run to the length of the whole AI chain, so the freshness line says what
// the wait is doing instead of repeating one generic sentence for the whole of it.
test('a narrated refresh replaces the generic freshness line with the phase, in both languages', () => {
  const base = { ...todayScreenState, isRefreshing: true, refreshFailed: false };
  const phases = [
    'checking-on-device',
    'asking-stylist',
    'answer-received',
    'preparing-outfits',
    'using-standard',
  ];
  const english = {
    'checking-on-device': 'Checking the on-device AI.',
    'asking-stylist': 'Asking the AI stylist.',
    'answer-received': 'AI answered. Checking the picks.',
    'preparing-outfits': 'Preparing your outfits.',
    'using-standard': 'AI did not answer. Using standard suggestions.',
  };
  const turkish = {
    'checking-on-device': 'Cihaz içi AI kontrol ediliyor.',
    'asking-stylist': 'AI stiliste soruluyor.',
    'answer-received': 'AI yanıt verdi. Seçimler kontrol ediliyor.',
    'preparing-outfits': 'Kombinlerin hazırlanıyor.',
    'using-standard': 'AI yanıt vermedi. Standart öneriler kullanılıyor.',
  };

  for (const phase of phases) {
    const en = loadedPresentation({ ...base, phase });
    const tr = loadedPresentation({ ...base, phase }, 'tr');

    assert.equal(en.header.freshness, english[phase]);
    assert.equal(tr.header.freshness, turkish[phase]);
    assert.equal(en.header.phase, phase);
    assert.equal(en.header.announceFreshness, true);
    // Law 5's status tone: no exclamation mark, and no provider or model name.
    for (const line of [english[phase], turkish[phase]]) {
      assert.equal(line.includes('!'), false);
      assert.doesNotMatch(line, /apple|openrouter|gemini|gpt|llama|cloudflare|workers ai/i);
    }
  }
});

// A phase belongs to a recommendation refresh. A settled screen, and a wait that is only the
// weather refreshing, carry none and keep the generic line.
test('a phase is dropped when the screen is not refreshing, and the loading wait carries it', () => {
  const settled = loadedPresentation({
    ...todayScreenState,
    isRefreshing: false,
    refreshFailed: false,
    phase: 'asking-stylist',
  });
  assert.equal(settled.header.phase, null);
  assert.match(settled.header.freshness, /^Updated at |^Last updated at /);

  const unnarrated = createTodayPresentation({ kind: 'loading' }, 'en', false, fixtureNow);
  const narrated = createTodayPresentation(
    { kind: 'loading', phase: 'preparing-outfits' }, 'en', false, fixtureNow,
  );
  assert.equal(unnarrated.phase, null);
  assert.equal(narrated.phase, 'preparing-outfits');
});

test('the freshness time follows the device clock setting, not the language', () => {
  const settled = { ...todayScreenState, isRefreshing: false, refreshFailed: false };

  const twentyFour = loadedPresentation(settled, 'en', false).header.freshness;
  const twelve = loadedPresentation(settled, 'en', true).header.freshness;

  assert.match(twentyFour, /\d{2}:\d{2}$/);
  assert.match(twelve, /\d{1,2}:\d{2}\s?(am|pm)$/iu);
  assert.match(loadedPresentation(settled, 'tr', true).header.freshness, /(ÖÖ|ÖS) \d/u);
});

test('the stage label reads temperature, condition, pieces and archetype in both languages', () => {
  assert.match(loadedPresentation().stageAccessibilityLabel, /^\d+ degrees Celsius\. .+\. .+, .+\. .+\.$/);
  assert.match(
    loadedPresentation(todayScreenState, 'tr').stageAccessibilityLabel,
    /^\d+ santigrat derece\. .+\. .+, .+\. .+\.$/,
  );
});
