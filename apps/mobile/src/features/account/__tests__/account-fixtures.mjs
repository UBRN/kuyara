// Plain rows for the account tests: valid domain values, one builder per synced table.

/** Nothing in any of the five synced tables. */
export const emptyRows = () => ({
  profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [],
});

export const phoneProfileId = 'phone-profile-sentinel';

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const stamp = (minutes) => new Date(Date.UTC(2026, 8, 1, 9, 0, 0) + minutes * 60_000).toISOString();

export function wardrobeItem(n, over = {}) {
  return {
    id: uuid(n),
    localProfileId: phoneProfileId,
    name: 'Linen shirt',
    category: 'top',
    entryState: 'owned',
    garmentTypeId: 't_shirt',
    color: 'blue',
    colorFamily: 'white',
    colorChoice: { kind: 'option', id: 'white' },
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: `wardrobe/photo-${n}.jpg`,
    createdAt: stamp(0),
    updatedAt: stamp(1),
    deletedAt: null,
    ...over,
  };
}

export function dayChoice(n, dayKey, over = {}) {
  return {
    id: uuid(n),
    localProfileId: phoneProfileId,
    dayKey,
    formality: 'smart',
    source: 'chip',
    styleAesthetics: ['classic', 'minimal'],
    createdAt: stamp(0),
    updatedAt: stamp(1),
    deletedAt: null,
    ...over,
  };
}

export function departure(n, dayKey, over = {}) {
  return {
    id: uuid(n),
    localProfileId: phoneProfileId,
    dayKey,
    departureAt: `${dayKey.slice(0, 10)}T06:00:00.000Z`,
    timeZone: 'Europe/Istanbul',
    createdAt: stamp(0),
    updatedAt: stamp(1),
    deletedAt: null,
    ...over,
  };
}

export function historyDay(n, dayKey, over = {}) {
  return {
    id: uuid(n),
    localProfileId: phoneProfileId,
    dayKey,
    outfit: {
      garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
      archetypeId: 'everyday_easy',
      formality: 'casual',
      source: 'recommended',
    },
    pieceColors: { primary_top: 'navy', bottom: 'indigo', footwear: 'white' },
    photoPath: `history/photo-${n}.jpg`,
    wornAt: stamp(2),
    createdAt: stamp(0),
    updatedAt: stamp(1),
    deletedAt: null,
    ...over,
  };
}

export function syncedProfile(over = {}) {
  return {
    displayName: 'Ada',
    gender: 'woman',
    dressStyle: 'smart',
    styleAesthetics: ['classic', 'minimal'],
    createdAt: stamp(0),
    updatedAt: stamp(1),
    ...over,
  };
}
