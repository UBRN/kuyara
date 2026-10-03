import assert from 'node:assert/strict';
import test from 'node:test';

import { todayActiveLocation, todayScreenState, todayWeatherSnapshot } from './__tests__/fixtures.ts';
import {
  isFirstDressingDay,
  manualRefreshOutcome,
  mayOpenDayQuestion,
  namePromptDue,
  pendingDayQuestion,
  recommendationCacheState,
  settledFirstOutfit,
  showsLaterReadyLine,
  styleAestheticsChanged,
  todayOutfitSettled,
  todayPresentationState,
  todayRetrySucceeded,
  updatingDayType,
} from './application/today-surface.ts';
import { namePromptVersion } from '../profile/domain/profile.ts';

const readyWeather = Object.freeze({
  status: 'ready',
  activeLocation: todayActiveLocation,
  snapshot: todayWeatherSnapshot,
  freshness: 'fresh',
  permission: { kind: 'undetermined' },
  locationFlow: 'idle',
  isSelectingLocation: false,
  isRefreshing: false,
  refreshFailure: null,
});

function readyRecommendation(overrides = {}) {
  return {
    status: 'ready',
    snapshot: { dressStyle: 'smart', recommendation: todayScreenState.snapshot.recommendation },
    isRefreshing: false,
    lastFailure: null,
    phase: null,
    exhausted: false,
    showFirstGenerationOverlay: false,
    ...overrides,
  };
}

function readyProfile(profile = {}) {
  return {
    status: 'ready',
    profile: {
      onboardingCompleted: true,
      namePromptVersion: namePromptVersion - 1,
      createdAt: '2026-08-13T06:00:00.000Z',
      ...profile,
    },
  };
}

test('the name prompt is due once per version, after onboarding, until dismissed', () => {
  assert.equal(namePromptDue(readyProfile(), false), true);
  assert.equal(namePromptDue(readyProfile(), true), false);
  assert.equal(namePromptDue(readyProfile({ onboardingCompleted: false }), false), false);
  assert.equal(namePromptDue(readyProfile({ namePromptVersion }), false), false);
  assert.equal(namePromptDue({ status: 'loading' }, false), false);
});

test('the morning question wins over the evening one', () => {
  assert.equal(pendingDayQuestion(true, true), 'morning');
  assert.equal(pendingDayQuestion(false, true), 'evening');
  assert.equal(pendingDayQuestion(undefined, false), null);
});

test('the day question opens once per dressing day and never over another overlay', () => {
  const open = {
    focused: true, launchDone: true, pending: 'morning', namePromptShown: false, tourActive: false,
    dressingDayKey: '2026-08-13', offeredDayKey: null, weather: readyWeather, state: todayScreenState,
  };
  assert.equal(mayOpenDayQuestion(open), true);
  for (const blocked of [
    { focused: false }, { launchDone: false }, { pending: null }, { namePromptShown: true },
    { tourActive: true }, { dressingDayKey: null }, { dressingDayKey: '' },
    { offeredDayKey: '2026-08-13' }, { state: { kind: 'unavailable' } },
    { weather: { ...readyWeather, activeLocation: null } },
  ]) {
    assert.equal(mayOpenDayQuestion({ ...open, ...blocked }), false, JSON.stringify(blocked));
  }
});

test('the first dressing day is the local day the profile was created on', () => {
  const profile = readyProfile().profile;
  assert.equal(isFirstDressingDay(profile, '2026-08-13'), true);
  assert.equal(isFirstDressingDay(profile, '2026-08-13-evening'), true);
  assert.equal(isFirstDressingDay(profile, '2026-08-14'), false);
  assert.equal(isFirstDressingDay({ ...profile, onboardingCompleted: false }, '2026-08-13'), false);
  assert.equal(isFirstDressingDay(null, '2026-08-13'), false);
  assert.equal(isFirstDressingDay(profile, null), false);
});

test('a day type is updating only while a refresh replaces an outfit made for another one', () => {
  assert.equal(updatingDayType(readyRecommendation({ isRefreshing: true }), 'formal'), 'formal');
  assert.equal(updatingDayType(readyRecommendation({ isRefreshing: true }), 'smart'), null);
  assert.equal(updatingDayType(readyRecommendation(), 'formal'), null);
  assert.equal(updatingDayType(readyRecommendation({ isRefreshing: true, snapshot: null }), 'formal'), null);
  assert.equal(updatingDayType(readyRecommendation({ isRefreshing: true }), undefined), null);
  assert.equal(updatingDayType({ status: 'loading' }, 'formal'), null);
});

test('the styles step writes only a changed set, whatever its order', () => {
  assert.equal(styleAestheticsChanged(['minimal', 'classic'], ['classic', 'minimal']), false);
  assert.equal(styleAestheticsChanged(['minimal'], ['minimal', 'classic']), true);
  assert.equal(styleAestheticsChanged([], []), false);
});

test('the later-ready line stands only under the settled outfit made for the departure', () => {
  const departure = { departureAt: '2026-08-13T16:00:00.000Z' };
  const covered = { ...todayScreenState, snapshot: { ...todayScreenState.snapshot, coverageStart: departure.departureAt } };
  assert.equal(showsLaterReadyLine(covered, departure), true);
  assert.equal(showsLaterReadyLine({ ...covered, isRefreshing: true }, departure), false);
  assert.equal(showsLaterReadyLine(covered, { departureAt: '2026-08-13T17:00:00.000Z' }), false);
  assert.equal(showsLaterReadyLine({ kind: 'loading' }, departure), false);
});

test('the cache state of a shown recommendation', () => {
  assert.equal(recommendationCacheState(todayScreenState), 'fresh');
  assert.equal(recommendationCacheState({ ...todayScreenState, isRefreshing: true }), 'refreshing');
  assert.equal(recommendationCacheState({
    ...todayScreenState, snapshot: { ...todayScreenState.snapshot, freshness: 'stale' },
  }), 'stale_shown');
});

test('the outfit is settled only when nothing is about to replace or cover it', () => {
  const settled = {
    focused: true, state: todayScreenState, runwayVisible: false, pullRefreshing: false,
    dayQuestionPending: false, dressingDayChoiceReady: true, updatingDayType: null, choosingWindow: null,
  };
  assert.equal(todayOutfitSettled(settled), true);
  assert.equal(todayOutfitSettled({ ...settled, dressingDayChoiceReady: undefined }), true);
  for (const unsettled of [
    { focused: false }, { state: { kind: 'loading' } }, { state: { ...todayScreenState, isRefreshing: true } },
    { runwayVisible: true }, { pullRefreshing: true }, { dayQuestionPending: true },
    { dressingDayChoiceReady: false }, { updatingDayType: 'formal' },
    { choosingWindow: { start: '2026-08-13T06:00:00.000Z', end: '2026-08-13T18:00:00.000Z' } },
  ]) {
    assert.equal(todayOutfitSettled({ ...settled, ...unsettled }), false, JSON.stringify(Object.keys(unsettled)));
  }
});

test('a manual refresh reports what the weather kept', () => {
  assert.equal(manualRefreshOutcome(readyWeather), 'success');
  assert.equal(manualRefreshOutcome({ ...readyWeather, refreshFailure: 'offline' }), 'failure_kept_last_known');
  assert.equal(manualRefreshOutcome({ ...readyWeather, refreshFailure: 'offline', snapshot: null }), 'failure_no_snapshot');
  assert.equal(manualRefreshOutcome({ status: 'loading' }), 'failure_no_snapshot');
});

test('a retry succeeds only when both the weather and a recommendation stand', () => {
  assert.equal(todayRetrySucceeded(readyWeather, readyRecommendation()), true);
  assert.equal(todayRetrySucceeded({ ...readyWeather, freshness: null }, readyRecommendation()), false);
  assert.equal(todayRetrySucceeded(readyWeather, readyRecommendation({ lastFailure: 'offline' })), false);
  assert.equal(todayRetrySucceeded(readyWeather, readyRecommendation({ snapshot: null })), false);
});

test('an unavailable Today without an active place asks for a place', () => {
  assert.deepEqual(todayPresentationState({ kind: 'unavailable' }, { ...readyWeather, activeLocation: null }),
    { kind: 'unavailable', reason: 'no-active-location' });
  assert.deepEqual(todayPresentationState({ kind: 'unavailable' }, readyWeather), { kind: 'unavailable' });
  assert.equal(todayPresentationState(todayScreenState, { ...readyWeather, activeLocation: null }), todayScreenState);
});

test('the settled outfit is the first one made for the current local day', () => {
  const now = Date.parse('2026-08-13T10:00:00.000Z');
  const snapshot = { localDayKey: '2026-08-13', recommendation: todayScreenState.snapshot.recommendation };
  assert.equal(settledFirstOutfit(snapshot, now), todayScreenState.snapshot.recommendation.outfits[0]);
  assert.equal(settledFirstOutfit({ ...snapshot, localDayKey: '2026-08-12' }, now), null);
  assert.equal(settledFirstOutfit(null, now), null);
});
