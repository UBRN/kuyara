import assert from 'node:assert/strict';
import test from 'node:test';

import {
  todayActiveLocation,
  todayScreenState,
  todayWardrobeItems,
  todayWeatherSnapshot,
} from './__tests__/fixtures.ts';
import {
  createTodayPresentation,
  createTomorrowPreviewPresentation,
  eveningLaterReadyLine,
  formatDressingDate,
} from './presentation/today-presentation.ts';
import { previewIsThisMorning, tomorrowForecastDay } from './application/outfit-detail-state.ts';
import { recommendOutfits } from '../recommendation/application/recommend-outfits.ts';
import { createKuyaraTheme } from '../../theme/theme.ts';
import { composeGarmentBoard } from '../../garment-art/compose-garment-board.ts';

const weatherReasons = [
  'Strong wind requires wind protection.',
  'Likely precipitation requires water protection.',
  'Drizzle calls for light water protection.',
  'Rain requires water protection.',
];
// `pnpm --filter @kuyara/mobile test` pins the device zone to UTC; the fixture location is
// Europe/Istanbul, so a label in UTC is the proof it followed the device and not the city.
const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');

test('tomorrow weather follows the preview departure on the place clock', () => {
  const preview = {
    localDayKey: '2026-08-15',
    coverageStart: '2026-08-14T15:00:00.000Z',
  };
  const rows = ['2026-08-14', '2026-08-15'].map((dateKey) => ({
    dateKey, condition: 'rain', minimumTemperatureCelsius: 15,
    maximumTemperatureCelsius: 23, precipitationProbability: 0.6, precipitationMillimetres: 4,
  }));
  assert.equal(tomorrowForecastDay(preview, { ...todayWeatherSnapshot,
    timeZone: 'America/Los_Angeles', daily: rows })?.dateKey, '2026-08-14');
  assert.equal(tomorrowForecastDay({ ...preview, localDayKey: '2026-08-14',
    coverageStart: '2026-08-14T22:00:00.000Z' }, { ...todayWeatherSnapshot,
    timeZone: 'Australia/Brisbane', daily: rows })?.dateKey, '2026-08-15');
});

test('the overnight preview says this morning in both languages', () => {
  const recommendation = todayScreenState.snapshot.recommendation;
  assert.equal(recommendation.status, 'recommended');
  const preview = { localDayKey: '2026-08-14', recommendation };
  const weather = { ...todayWeatherSnapshot, daily: [{
    dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 15,
    maximumTemperatureCelsius: 23, precipitationProbability: 0.6, precipitationMillimetres: 4,
  }] };
  const now = Date.parse('2026-08-13T22:30:00.000Z');
  const english = createTomorrowPreviewPresentation(preview, weather, 'en', 'celsius', now);
  const turkish = createTomorrowPreviewPresentation(preview, weather, 'tr', 'celsius', now);
  assert.equal(english?.heading, 'This morning');
  assert.match(english?.accessibilityLabel ?? '', /^This morning:/);
  assert.equal(turkish?.heading, 'Bu sabah');
  assert.match(turkish?.accessibilityLabel ?? '', /^Bu sabah:/);
});

test('the preview is this morning only between midnight and 04:00 on the place clock', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(previewIsThisMorning(at('2026-08-13T22:30:00.000Z'), 'Europe/Istanbul', '2026-08-14'), true);
  assert.equal(previewIsThisMorning(at('2026-08-14T01:00:00.000Z'), 'Europe/Istanbul', '2026-08-14'), false);
  assert.equal(previewIsThisMorning(at('2026-08-13T22:30:00.000Z'), 'Europe/Istanbul', '2026-08-15'), false);
});

test('the evening Later note uses the saved choice times in both languages', () => {
  const departure = {
    dayKey: '2026-08-13:evening', timeZone: 'Europe/Istanbul',
    departureAt: '2026-08-13T16:00:00.000Z',
    createdAt: '2026-08-13T14:00:00.000Z',
    updatedAt: '2026-08-13T15:00:00.000Z',
  };
  const now = Date.parse('2026-08-13T15:30:00.000Z');
  assert.equal(eveningLaterReadyLine(departure, now, 'en', false),
    'Your 19:00 outfit is ready at 18:00');
  assert.equal(eveningLaterReadyLine(departure, now, 'tr', false),
    '19:00 için kombinin saat 18:00 itibarıyla hazır');
  assert.equal(eveningLaterReadyLine({ ...departure,
    updatedAt: '2026-08-13T14:00:00.000Z' }, now, 'en', false), null);
});

test('the evening Later note stays until a departure past midnight, and a small-hours Later gets one', () => {
  const departure = {
    dayKey: '2026-08-13:evening', timeZone: 'Europe/Istanbul',
    departureAt: '2026-08-13T21:30:00.000Z',
    createdAt: '2026-08-13T19:30:00.000Z',
    updatedAt: '2026-08-13T19:30:00.000Z',
  };
  assert.equal(eveningLaterReadyLine(departure, Date.parse('2026-08-13T21:10:00.000Z'), 'en', false),
    'Your 00:30 outfit is ready at 22:30');
  assert.equal(eveningLaterReadyLine(departure, Date.parse('2026-08-13T21:30:00.000Z'), 'en', false), null);
  const smallHours = { ...departure, departureAt: '2026-08-13T22:00:00.000Z',
    createdAt: '2026-08-13T21:10:00.000Z', updatedAt: '2026-08-13T21:10:00.000Z' };
  assert.equal(eveningLaterReadyLine(smallHours, Date.parse('2026-08-13T21:20:00.000Z'), 'en', false),
    'Your 01:00 outfit is ready at 00:10');
});

function loadedPresentation(
  state = todayScreenState,
  language = 'en',
  hour12 = false,
  now = fixtureNow,
  temperatureUnit = 'celsius',
) {
  const presentation = createTodayPresentation(state, language, hour12, temperatureUnit, now);
  assert.equal(presentation.kind, 'loaded');
  return presentation;
}

test('Today converts displayed weather and spoken units to Fahrenheit', () => {
  const presentation = loadedPresentation(todayScreenState, 'en', false, fixtureNow, 'fahrenheit');
  assert.equal(presentation.weather.temperature, '68.0°');
  assert.match(presentation.weather.accessibilityLabel, /degrees Fahrenheit/);
  assert.match(presentation.titleAccessibilityLabel, /degrees Fahrenheit/);
  assert.match(presentation.weather.recapAccessibilityLabel, /degrees Fahrenheit/);
  assert.match(presentation.stageAccessibilityLabel, /degrees Fahrenheit/);
});

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
  // A 20 C rainy day: the rain label is its own, the snow label is not, and the rain boot
  // that used to carry `snow_day` here leaves the third outfit on the next rung.
  assert.deepEqual(
    todayScreenState.snapshot.recommendation.outfits.map(({ archetypeId }) => archetypeId),
    ['rain_ready', 'wind_guard', 'weekend_relaxed'],
  );
});

test('loaded mapping uses localized catalog names, slot order, positions, and no emphasis on any option', () => {
  const english = loadedPresentation();

  assert.deepEqual(
    english.suggestions.map(({ id, positionLabel, title, summary, ...rest }) => ({
      id,
      positionLabel,
      title,
      summary,
      hasEmphasis: 'emphasis' in rest,
    })),
    [
      {
        id: todayScreenState.snapshot.recommendation.outfits[0].optionId,
        positionLabel: 'Option 1 of 3',
        title: 'Rain Ready',
        summary: 'T-shirt + Skirt + Rain jacket + Rain boots',
        hasEmphasis: false,
      },
      {
        id: todayScreenState.snapshot.recommendation.outfits[1].optionId,
        positionLabel: 'Option 2 of 3',
        title: 'Wind Guard',
        summary: 'Blouse + Jeans + Rain jacket + Rain boots',
        hasEmphasis: false,
      },
      {
        id: todayScreenState.snapshot.recommendation.outfits[2].optionId,
        positionLabel: 'Option 3 of 3',
        title: 'Easygoing',
        summary: 'Blouse + Skirt + Rain jacket + Rain boots',
        hasEmphasis: false,
      },
    ],
  );
  assert.deepEqual(english.suggestions[0].pieces, [
    { slot: 'Top', item: 'T-shirt', category: 'top', garmentTypeId: 't_shirt', changed: false },
    { slot: 'Bottom', item: 'Skirt', category: 'bottom', garmentTypeId: 'skirt', changed: false },
    { slot: 'Outer layer', item: 'Rain jacket', category: 'outerwear', garmentTypeId: 'rain_jacket', changed: false },
    { slot: 'Footwear', item: 'Rain boots', category: 'footwear', garmentTypeId: 'rain_boots', changed: false },
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
    accessories: { head: null, neck: null, hands: null, handheld: null },
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
    'Option 1 of 3. Rain Ready. Top: T-shirt. Bottom: Skirt. Outer layer: Rain jacket. Footwear: Rain boots. Why this outfit: Strong wind requires wind protection. Likely precipitation requires water protection. Drizzle calls for light water protection. Rain requires water protection.',
  );
  assert.equal(
    turkish.suggestions[0].accessibilityLabel,
    '3 seçenekten birincisi. Yağmura Hazır. Üst: Tişört. Alt: Etek. Dış katman: Yağmurluk. Ayakkabı: Yağmur botu. Neden bu kombin: Rüzgâr kuvvetli, rüzgâr koruması gerekiyor. Yağış bekleniyor, su koruması gerekiyor. Çiselemede hafif bir su koruması gerekiyor. Yağmurda su koruması gerekiyor.',
  );
});

test('a mandatory requirement explains the outfit before an optional one', () => {
  // Warm enough to prefer breathability (optional below 28) and windy enough to require
  // wind protection (mandatory at 8 m/s). The derivation lists temperature first, which
  // would explain a wind-led outfit by the heat.
  const measurements = {
    temperatureCelsius: 25,
    apparentTemperatureCelsius: 26,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 9,
  };
  const weather = {
    ...todayWeatherSnapshot,
    current: { ...todayWeatherSnapshot.current, ...measurements },
    minimumTemperatureCelsius: 24,
    maximumTemperatureCelsius: 26,
    hourly: [{
      ...todayWeatherSnapshot.hourly[0],
      ...measurements,
      forecastAt: '2026-08-13T07:00:00.000Z',
    }],
  };
  const recommendation = recommendOutfits({
    snapshot: weather,
    now: todayWeatherSnapshot.current.observedAt,
    clothingPreference: 'womens',
    dayVariant: 0,
  });
  assert.equal(recommendation.status, 'recommended');
  assert.deepEqual(recommendation.requirements.reasonCodes, [
    'temperature_high',
    'apparent_temperature_high',
    'wind_strong',
  ]);

  const presentation = loadedPresentation({
    ...todayScreenState,
    snapshot: { ...todayScreenState.snapshot, weather, recommendation },
  });

  // The mandatory reason leads; the two optional ones keep the derivation's order behind it.
  assert.deepEqual(presentation.suggestions[0].reasons.slice(0, 3), [
    'Strong wind requires wind protection.',
    'High temperatures require breathable clothing.',
    'It feels hot enough to require breathable clothing.',
  ]);
});

test('the unavailable branch offers a retry and says when the cause is being offline', () => {
  const generic = createTodayPresentation({ kind: 'unavailable' }, 'en', false, 'celsius', fixtureNow);
  const rateLimited = createTodayPresentation(
    { kind: 'unavailable', failure: 'rate-limited' },
    'en',
    false, 'celsius',
    fixtureNow,
  );
  const offline = createTodayPresentation(
    { kind: 'unavailable', failure: 'offline' },
    'en',
    false, 'celsius',
    fixtureNow,
  );
  const offlineTurkish = createTodayPresentation(
    { kind: 'unavailable', failure: 'offline' },
    'tr',
    false, 'celsius',
    fixtureNow,
  );
  const noLocation = createTodayPresentation(
    { kind: 'unavailable', reason: 'no-active-location' },
    'en',
    false, 'celsius',
    fixtureNow,
  );

  assert.equal(generic.actionLabel, 'Refresh');
  assert.equal(generic.title, 'Today’s guidance is unavailable');
  assert.equal(rateLimited.title, 'Today’s guidance is unavailable');
  assert.equal(rateLimited.actionLabel, 'Refresh');
  assert.equal(offline.title, 'You’re offline');
  assert.equal(offline.body, 'Connect to the internet and try again.');
  assert.equal(
    offline.accessibilityLabel,
    'You’re offline. Connect to the internet and try again.',
  );
  assert.equal(offline.actionLabel, 'Refresh');
  assert.equal(offlineTurkish.title, 'Çevrimdışısın');
  assert.equal(offlineTurkish.actionLabel, 'Yenile');
  // The missing-location branch keeps its own action: it opens the picker, not a retry.
  assert.equal(noLocation.actionLabel, 'Choose a location');
});

// A day whose measurements ask for nothing: no clothing requirement is derived, and the
// rationale falls through to the sentence that says exactly that.
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

test('a mild day falls back to the deterministic status sentence', () => {
  // A mild day derives no requirement and therefore no reason code, so the rationale line
  // would render empty without the sentence that names the absence.
  const liveForecast = {
    ...mildWeather,
    hourly: [{ ...mildWeather.hourly[0], forecastAt: '2026-08-13T07:00:00.000Z' }],
  };
  const now = todayWeatherSnapshot.current.observedAt;
  const { recommendation, presentation } = mildPresentation(liveForecast, now);

  assert.equal(recommendation.outfits[0].penaltyPoints, 0);
  assert.deepEqual(recommendation.requirements.reasonCodes, []);
  assert.deepEqual(recommendation.outfits[0].reasonCodes, []);
  assert.deepEqual(presentation.suggestions[0].reasons, [
    'Nothing in the weather ahead asks for special protection.',
  ]);
  assert.deepEqual(
    mildPresentation(liveForecast, now, 'tr').presentation.suggestions[0].reasons,
    ['Havada özel bir koruma isteyen bir şey yok.'],
  );
});

test('a wide day spread shows its reason for a stored or AI-chosen result as it does for a fresh one', () => {
  // 13 to 24 C spread over a mild 20 C window: no requirement carries `daily_range_wide`,
  // so a result rebuilt from its requirements (a restart, an AI or on-device answer) has
  // lost the one code derivation added globally, and the day's own spread must restore it.
  const wide = {
    ...mildWeather,
    minimumTemperatureCelsius: 13,
    maximumTemperatureCelsius: 24,
    hourly: [{ ...mildWeather.hourly[0], forecastAt: '2026-08-13T07:00:00.000Z' }],
  };
  const now = todayWeatherSnapshot.current.observedAt;
  const { recommendation, presentation: fresh } = mildPresentation(wide, now);
  assert.deepEqual(recommendation.requirements.reasonCodes, ['daily_range_wide']);
  const sentence = 'A wide temperature range calls for adjustable layers.';
  assert.deepEqual(fresh.suggestions[0].reasons, [sentence]);

  const restored = loadedPresentation({
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      weather: wide,
      recommendation: {
        ...recommendation,
        requirements: { ...recommendation.requirements, reasonCodes: [] },
      },
    },
  });
  assert.deepEqual(restored.suggestions[0].reasons, [sentence]);
});

// ADR 0034 section 4: the two AI modes badge themselves, each with its own mode so the
// screen can draw its own symbol, the deterministic one badges nothing at rest, and neither
// names a provider. The detail's
// source sentence is present in all three modes, and kuyara is its subject.
test('only the AI generation modes carry a localized accessible generation mark', () => {
  const recommendation = todayScreenState.snapshot.recommendation;
  assert.equal(recommendation.status, 'recommended');
  const presentationOf = (generationMode) => loadedPresentation({
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      recommendation: { ...recommendation, generationMode },
    },
  });

  for (const [generationMode, label, accessibilityLabel, source] of [
    [
      'on-device-ai',
      'Chosen with Apple Intelligence',
      'Recommendation source: kuyara chose this outfit with Apple Intelligence',
      'kuyara chose this outfit on your device with Apple Intelligence.',
    ],
    [
      'ai-assisted',
      'Chosen with AI',
      'Recommendation source: kuyara chose this outfit with AI',
      'kuyara chose this outfit with online AI.',
    ],
  ]) {
    const presentation = presentationOf(generationMode);
    assert.deepEqual(presentation.generationMode, { mode: generationMode, label, accessibilityLabel });
    assert.equal(presentation.generationSource, source);
  }

  const deterministic = presentationOf('deterministic-fallback');
  assert.equal(deterministic.generationMode, null);
  assert.equal(
    deterministic.generationSource,
    'kuyara put this outfit together on your device.',
  );
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
      text: 'Footwear water protection: Rain boots.',
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
  // One decimal in both, and the reader's own separator: the point in English, the
  // comma in Turkish.
  assert.equal(english.weather.temperature, '20.0°');
  assert.equal(turkish.weather.temperature, '20,0°');
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
  assert.match(turkish.header.freshness, /06:05.*Biraz eskimiş olabilir/);
  assert.deepEqual(
    turkish.suggestions.map(({ title }) => title),
    ['Yağmura Hazır', 'Rüzgâra Karşı', 'Keyifli Gün'],
  );
  assert.deepEqual(
    turkish.suggestions.map(({ summary }) => summary),
    [
      'Tişört + Etek + Yağmurluk + Yağmur botu',
      'Bluz + Kot pantolon + Yağmurluk + Yağmur botu',
      'Bluz + Etek + Yağmurluk + Yağmur botu',
    ],
  );
  assert.equal(english.header.location, 'Istanbul');
  assert.equal(turkish.header.location, 'Istanbul');
  assert.equal(english.weather.condition, 'Rain');
  assert.equal(turkish.weather.condition, 'Yağmurlu');
});

const withoutPaletteDay = (suggestions) => suggestions.map(({ palette, ...rest }) => ({
  ...rest,
  palette: { optionId: palette.optionId, formality: palette.formality, pieces: palette.pieces },
}));

test('fresh weather updates derived insight lines without changing the selected outfits', () => {
  const weather = todayScreenState.snapshot.weather;
  const fullWeather = {
    ...weather,
    hourly: Array.from({ length: 14 }, (_, index) => ({
      ...weather.hourly[2],
      forecastAt: `2026-08-13T${String(index + 7).padStart(2, '0')}:00:00.000Z`,
      condition: 'rain',
      precipitationProbability: 0.8,
      windSpeedMetersPerSecond: 8,
    })),
  };
  const beforeState = {
    ...todayScreenState,
    snapshot: { ...todayScreenState.snapshot, weather: fullWeather,
      paletteBasis: { temperatureC: fullWeather.current.temperatureCelsius,
        condition: fullWeather.current.condition, localDayKey: '2026-08-13' } },
  };
  const before = loadedPresentation(beforeState);
  const clearMeasurements = (measurement) => ({
    ...measurement,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 1,
    temperatureCelsius: 31,
    apparentTemperatureCelsius: 33,
  });
  const refreshedWeather = {
    ...fullWeather,
    id: 'fresh-weather',
    current: clearMeasurements(fullWeather.current),
    hourly: fullWeather.hourly.map(clearMeasurements),
    minimumTemperatureCelsius: 30,
    maximumTemperatureCelsius: 34,
  };
  const after = loadedPresentation({
    ...beforeState,
    snapshot: {
      ...beforeState.snapshot,
      weather: refreshedWeather,
    },
  });
  assert.deepEqual(after.suggestions.map(({ palette }) => palette),
    before.suggestions.map(({ palette }) => palette));
  const newlyChosen = loadedPresentation({ ...beforeState, snapshot: {
    ...beforeState.snapshot,
    weather: refreshedWeather,
    paletteBasis: { temperatureC: 31, condition: 'clear', localDayKey: '2026-08-13' },
  } });
  assert.deepEqual(newlyChosen.suggestions.map(({ palette }) => [palette.temperatureC, palette.condition]),
    newlyChosen.suggestions.map(() => [31, 'clear']));
  assert.notDeepEqual(newlyChosen.suggestions.map(({ palette }) => palette),
    before.suggestions.map(({ palette }) => palette));
  assert.deepEqual(after.generationMode, before.generationMode);
  assert.notEqual(after.dayInsight, before.dayInsight);
});

test('an older recommendation without a palette basis follows current weather', () => {
  const weather = todayScreenState.snapshot.weather;
  const original = loadedPresentation(todayScreenState);
  const refreshed = loadedPresentation({ ...todayScreenState, snapshot: {
    ...todayScreenState.snapshot,
    weather: { ...weather, current: { ...weather.current, temperatureCelsius: 31,
      condition: 'clear' } },
  } });
  assert.equal(refreshed.suggestions[0].palette.temperatureC, 31);
  assert.equal(refreshed.suggestions[0].palette.condition, 'clear');
  assert.notDeepEqual(refreshed.suggestions[0].palette, original.suggestions[0].palette);
});

test('an AI-authored insight stays with its outfit when weather refreshes', () => {
  const original = todayScreenState.snapshot;
  const recommendation = {
    ...original.recommendation,
    insightSentence: 'A considered look for your day.',
    insightLocale: 'en',
  };
  const state = {
    ...todayScreenState,
    snapshot: { ...original, recommendation },
  };
  const before = loadedPresentation(state);
  const after = loadedPresentation({
    ...state,
    snapshot: { ...state.snapshot, weather: {
      ...original.weather,
      id: 'fresh-weather',
      current: { ...original.weather.current, condition: 'clear' },
    } },
  });
  assert.equal(after.dayInsight, before.dayInsight);
  assert.deepEqual(withoutPaletteDay(after.suggestions), withoutPaletteDay(before.suggestions));
});

test('a device location shows its locality name, and the generic copy without one', () => {
  const deviceLocation = {
    source: 'device',
    accuracy: 'full',
    locationKey: 'device:4101:2898',
    coordinates: todayActiveLocation.coordinates,
    timeZone: todayActiveLocation.timeZone,
  };
  const named = (displayName) => ({
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      activeLocation: { ...deviceLocation, displayName },
    },
  });

  assert.equal(loadedPresentation(named('Kadıköy')).header.location, 'Kadıköy');
  assert.equal(loadedPresentation(named('Kadıköy'), 'tr').header.location, 'Kadıköy');
  assert.equal(loadedPresentation(named(null)).header.location, 'Current location');
  assert.equal(loadedPresentation(named(null), 'tr').header.location, 'Mevcut konum');
  assert.equal(
    loadedPresentation({
      ...todayScreenState,
      snapshot: { ...todayScreenState.snapshot, activeLocation: deviceLocation },
    }).header.location,
    'Current location',
  );
});

test('loading, unavailable, and semantic theme behavior remains explicit', () => {
  const loading = createTodayPresentation({ kind: 'loading' }, 'en', false, 'celsius', fixtureNow);
  const unavailable = createTodayPresentation({ kind: 'unavailable' }, 'tr', false, 'celsius', fixtureNow);
  const light = createKuyaraTheme('light');
  const dark = createKuyaraTheme('dark');

  assert.equal(loading.kind, 'loading');
  assert.match(loading.accessibilityLabel, /loading/i);
  assert.equal(unavailable.kind, 'unavailable');
  assert.match(unavailable.title, /kullanılamıyor/);
  assert.notEqual(light.colors.background, dark.colors.background);
});

test('the freshness line reports refreshing, failure, staleness, and last update in that precedence', () => {
  const base = todayScreenState;

  const refreshing = loadedPresentation({ ...base, isRefreshing: true, refreshFailed: true });
  assert.equal(refreshing.header.freshness, 'Refreshing today’s guidance…');
  assert.equal(refreshing.header.isRefreshing, true);
  assert.equal(refreshing.header.announceFreshness, true);

  const failed = loadedPresentation({ ...base, isRefreshing: false, refreshFailed: true });
  assert.match(failed.header.freshness, /^Couldn’t refresh · Showing last update from /);
  assert.equal(failed.header.isRefreshing, false);
  assert.equal(failed.header.announceFreshness, true);

  const settled = loadedPresentation({ ...base, isRefreshing: false, refreshFailed: false });
  assert.match(settled.header.freshness, /^Updated at |^Last updated at /);
  assert.equal(settled.header.announceFreshness, settled.header.isStale);

  const turkish = loadedPresentation({ ...base, isRefreshing: true, refreshFailed: false }, 'tr');
  assert.equal(turkish.header.freshness, 'Bugünün önerileri yenileniyor…');
  assert.equal(turkish.header.phase, null);
});

test('the freshness line carries the short date once the snapshot is not from the current local day', () => {
  const failed = { ...todayScreenState, isRefreshing: false, refreshFailed: true };
  const sameDay = loadedPresentation(failed, 'en', false, fixtureNow);
  assert.doesNotMatch(sameDay.header.freshness, /2026|\//);
  for (const days of [1, 3]) {
    const later = loadedPresentation(failed, 'en', false, fixtureNow + days * 24 * 3_600_000);
    assert.match(later.header.freshness, /^Couldn’t refresh · Showing last update from 13\/08\/2026, 06:05$/);
  }
  const turkish = loadedPresentation(
    { ...todayScreenState, isRefreshing: false, refreshFailed: false },
    'tr', false, fixtureNow + 24 * 3_600_000,
  );
  assert.match(turkish.header.freshness, /13\.08\.2026 06:05/);
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
    'checking-on-device': 'Cihazdaki yapay zeka kontrol ediliyor.',
    'asking-stylist': 'Yapay zeka stilistine soruluyor.',
    'answer-received': 'Yapay zeka yanıt verdi. Seçimler kontrol ediliyor.',
    'preparing-outfits': 'Kombinlerin hazırlanıyor.',
    'using-standard': 'Yapay zeka yanıt vermedi. Standart öneriler kullanılıyor.',
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

  const unnarrated = createTodayPresentation({ kind: 'loading' }, 'en', false, 'celsius', fixtureNow);
  const narrated = createTodayPresentation(
    { kind: 'loading', phase: 'preparing-outfits' }, 'en', false, 'celsius', fixtureNow,
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
  assert.match(loadedPresentation().stageAccessibilityLabel, /^-?\d+\.\d degrees Celsius\. .+\. .+, .+\. .+\.$/);
  assert.match(
    loadedPresentation(todayScreenState, 'tr').stageAccessibilityLabel,
    /^-?\d+,\d santigrat derece\. .+\. .+, .+\. .+\.$/,
  );
});

// M15: Today's top-row date follows the 04:00 dressing day.
// The suite runs in UTC, so these instants are the device's wall clock.
test('the top-row date names the dressing day, not the calendar day, before 04:00', () => {
  const at = (iso, language = 'en') => loadedPresentation(todayScreenState, language, false, Date.parse(iso)).date;

  // Newer ICU abbreviates September to "Sept" in British English, older to "Sep".
  assert.match(at('2026-09-25T02:30:00.000Z'), /^Thu 24 Sept?$/);
  assert.equal(at('2026-09-25T02:30:00.000Z', 'tr'), '24 Eyl Per');
  assert.match(at('2026-09-25T04:30:00.000Z'), /^Fri 25 Sept?$/);
  assert.match(at('2026-09-24T19:00:00.000Z'), /^Thu 24 Sept?$/);
});

test('the dressing date reads in each language\'s own order: English weekday first, Turkish day first', () => {
  assert.equal(formatDressingDate('2026-10-06', 'en'), 'Tue 6 Oct');
  assert.equal(formatDressingDate('2026-10-06', 'tr'), '6 Eki Sal');
});

// Phase 7: a changed outfit is the reader's. Its title and "changed from"
// line, its source sentence per generation mode and count, and its reasons are its own.
test('a changed outfit names itself the reader\'s and says where kuyara chose the rest, per mode', async () => {
  const { applySwaps } = await import('../recommendation/domain/manual-mix.ts');
  const { messages } = await import('../../localization/messages.ts');
  const { recommendation } = todayScreenState.snapshot;
  const [pick] = recommendation.outfits;
  const one = applySwaps(pick, { outer_layer: 'trench_coat' }, recommendation.requirements, 'womens');
  const two = applySwaps(pick, { outer_layer: 'trench_coat', footwear: 'sneakers' }, recommendation.requirements, 'womens');
  for (const language of ['en', 'tr']) {
    const copy = messages[language].today.manualMix;
    for (const [mode, key] of [['on-device-ai', 'onDeviceAi'], ['ai-assisted', 'aiAssisted'], ['deterministic-fallback', 'deterministic']]) {
      const state = { ...todayScreenState, snapshot: { ...todayScreenState.snapshot,
        recommendation: { ...recommendation, generationMode: mode } } };
      const present = (manual) => createTodayPresentation(state, language, false, 'celsius', fixtureNow,
        { optionId: pick.optionId, outfit: manual.outfit, changedSlots: manual.changedSlots });
      assert.equal(present(one).generationSource, copy.sourceOne[key]);
      assert.equal(present(two).generationSource, copy.sourceMany[key]);
    }
    assert.doesNotMatch(copy.sourceOne.deterministic, /\bAI\b|Apple Intelligence/);
    assert.doesNotMatch(copy.sourceMany.deterministic, /\bAI\b|Apple Intelligence/);
    const untouched = loadedPresentation(todayScreenState, language).suggestions[0];
    const changed = createTodayPresentation(todayScreenState, language, false, 'celsius', fixtureNow,
      { optionId: pick.optionId, outfit: one.outfit, changedSlots: one.changedSlots }).suggestions[0];
    assert.equal(changed.title, copy.title);
    assert.equal(changed.changedFrom, copy.changedFrom(untouched.title));
    assert.equal(untouched.changedFrom, null);
    assert.deepEqual(changed.pieces.filter(({ changed: mark }) => mark).map(({ garmentTypeId }) => garmentTypeId),
      ['trench_coat']);
    // The reasoning is recomputed: the rain jacket no longer answers the rain.
    assert.notDeepEqual(changed.requirementRows, untouched.requirementRows);
    assert.equal(changed.requirementRows.some(({ text }) => text.includes(
      messages[language].catalog['catalog.garment_type.rain_jacket.name'])), false);
    // P1: every piece still kuyara's pick keeps the original palette's colours.
    assert.deepEqual(changed.keptColors.original, untouched.palette);
    assert.equal(changed.keptColors.slots.includes('outer_layer'), false);
    assert.ok(changed.keptColors.slots.includes('footwear'));
    // The other options are untouched.
    assert.equal(changed.id, untouched.id);
  }
  // With no change the sentence is the recommendation's own.
  const unchanged = createTodayPresentation(todayScreenState, 'en', false, 'celsius', fixtureNow,
    { optionId: pick.optionId, outfit: pick, changedSlots: [] });
  assert.equal(unchanged.generationSource, loadedPresentation().generationSource);
});

// A weather update rebuilds the screen state with new objects while the saved outfits stay the
// same. The boards take the very arrays they already drew, so they neither compose nor paint
// again; a different palette day still gives the outfit new colours.
test('a weather update that leaves the outfits alone hands each board the pieces and palette it already has', () => {
  const before = loadedPresentation().suggestions;
  const refreshing = loadedPresentation({ ...todayScreenState, isRefreshing: true, refreshFailed: true }).suggestions;
  assert.equal(refreshing.length, before.length);
  refreshing.forEach((suggestion, index) => {
    assert.equal(suggestion.boardPieces, before[index].boardPieces);
    assert.equal(suggestion.palette, before[index].palette);
  });

  const warmer = loadedPresentation({
    ...todayScreenState,
    snapshot: {
      ...todayScreenState.snapshot,
      paletteBasis: undefined,
      weather: {
        ...todayScreenState.snapshot.weather,
        current: {
          ...todayScreenState.snapshot.weather.current,
          temperatureCelsius: todayScreenState.snapshot.weather.current.temperatureCelsius + 9,
        },
      },
    },
  }).suggestions;
  assert.equal(warmer[0].boardPieces, before[0].boardPieces);
  assert.notEqual(warmer[0].palette, before[0].palette);
  assert.equal(warmer[0].palette.temperatureC, todayScreenState.snapshot.weather.current.temperatureCelsius + 9);
});

// The caption names the window's day only when the window starts on another calendar date
// than now's, both read on the place's clock. A Crewe outfit chosen for 23:15 to 01:00 on
// Monday 5 October, read from Istanbul (two hours ahead): before London's midnight the
// window starts today; after it, the window started yesterday and the day is named.
test('the coverage caption names the window day once the place clock has passed midnight', () => {
  const hour = todayWeatherSnapshot.hourly[0];
  const weather = { ...todayWeatherSnapshot, timeZone: 'Europe/London',
    hourly: ['2026-10-05T22:00:00.000Z', '2026-10-05T23:00:00.000Z', '2026-10-06T00:00:00.000Z']
      .map((forecastAt) => ({ ...hour, forecastAt })) };
  const state = { ...todayScreenState, snapshot: { ...todayScreenState.snapshot, weather,
    coverageStart: '2026-10-05T22:15:00.000Z', coverageEnd: '2026-10-06T00:00:00.000Z' } };
  const caption = (now) => {
    const presentation = createTodayPresentation(state, 'tr', false, 'celsius', Date.parse(now));
    assert.equal(presentation.kind, 'loaded');
    return presentation.coverageCaption;
  };

  // 01:54 in Istanbul is 23:54 in Crewe, still Monday there.
  assert.equal(caption('2026-10-05T22:54:00.000Z'), '23:15 ile 01:00 arasındaki havaya göre seçildi.');
  // 02:05 in Istanbul is 00:05 on Tuesday in Crewe.
  assert.equal(caption('2026-10-05T23:05:00.000Z'),
    '5 Ekim Pazartesi, 23:15 ile 01:00 arasındaki havaya göre seçildi.');
});
