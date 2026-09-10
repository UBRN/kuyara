import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nightTodayScreenState,
  todayActiveLocation,
  todayScreenState,
  todayWardrobeItems,
  todayWeatherSnapshot,
} from './__tests__/fixtures.ts';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from './presentation/today-presentation.ts';
import { createKuyaraTheme } from '../../theme/theme.ts';
import { composeGarmentBoard } from '../../components/ui/garment-board/compose-garment-board.ts';

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
        summary: 'Jumpsuit + Rain jacket + Winter boots',
        emphasis: 'Recommended',
      },
      {
        id: 'outfit-2',
        positionLabel: 'Option 2 of 3',
        title: 'Snow Day',
        summary: 'Blouse + Jeans + Rain jacket + Winter boots',
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

test('loaded presentation derives the atmosphere from condition and snapshot-local daypart', () => {
  assert.equal(loadedPresentation(todayScreenState).atmosphere, 'fallingDay');
  assert.equal(loadedPresentation(nightTodayScreenState).atmosphere, 'fallingNight');
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
  assert.match(english.header.freshness, /09:05.*out of date/i);
  assert.match(turkish.header.freshness, /09:05.*Güncelliğini yitirmiş olabilir/);
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

test('the stage label reads temperature, condition, pieces and archetype in both languages', () => {
  assert.match(loadedPresentation().stageAccessibilityLabel, /^\d+ degrees Celsius\. .+\. .+, .+\. .+\.$/);
  assert.match(
    loadedPresentation(todayScreenState, 'tr').stageAccessibilityLabel,
    /^\d+ santigrat derece\. .+\. .+, .+\. .+\.$/,
  );
});
