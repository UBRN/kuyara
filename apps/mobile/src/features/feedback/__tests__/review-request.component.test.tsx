import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  noteOutfitDetailVisit,
  resetReviewRequestLaunch,
  useReviewRequestOnReturn,
} from '@/features/feedback/application/use-review-request';

const mockRequest = jest.fn(async () => undefined);
const mockMarkReviewRequested = jest.fn(async () => undefined);
let mockTourActive = false;
let mockConsent = 'granted';

jest.mock('@/features/feedback/data/store-review', () => ({ requestStoreReview: () => mockRequest() }));
jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({
    markReviewRequested: mockMarkReviewRequested,
    state: {
      status: 'ready',
      profile: {
        onboardingCompleted: true, analyticsConsent: mockConsent,
        createdAt: '2026-01-01T09:00:00.000Z', reviewRequestVersion: 0,
      },
    },
  }),
}));
jest.mock('@/features/walkthrough/application/walkthrough-context', () => ({
  useWalkthrough: () => ({ active: mockTourActive }),
}));

// Each test is a fresh launch: the hook keeps its launch facts at module scope.
function freshLaunch() {
  resetReviewRequestLaunch();
  return { noteOutfitDetailVisit, useReviewRequestOnReturn };
}
type Hook = ReturnType<typeof freshLaunch>;

async function returnToToday(hook: Hook, overlayOpen = false) {
  const today = await renderHook(({ focused }: { focused: boolean }) => hook.useReviewRequestOnReturn(focused, overlayOpen),
    { initialProps: { focused: true } });
  await act(async () => { today.rerender({ focused: false }); });
  hook.noteOutfitDetailVisit();
  await act(async () => { today.rerender({ focused: true }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  return today;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRequest.mockClear();
  mockMarkReviewRequested.mockClear();
  mockTourActive = false;
  mockConsent = 'granted';
  AppState.currentState = 'active';
});

afterEach(() => { jest.useRealTimers(); });

test('a return from outfit detail stores the gate, then requests the system prompt once', async () => {
  const hook = freshLaunch();
  const today = await returnToToday(hook);
  expect(mockMarkReviewRequested).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledTimes(1);

  await act(async () => { today.rerender({ focused: false }); });
  hook.noteOutfitDetailVisit();
  await act(async () => { today.rerender({ focused: true }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('focusing Today without an outfit detail visit requests nothing', async () => {
  const hook = freshLaunch();
  const today = await renderHook(({ focused }: { focused: boolean }) => hook.useReviewRequestOnReturn(focused, false),
    { initialProps: { focused: false } });
  await act(async () => { today.rerender({ focused: true }); });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a launch that showed a sheet, prompt or offer over Today requests nothing', async () => {
  await returnToToday(freshLaunch(), true);
  expect(mockMarkReviewRequested).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a launch that showed the tour requests nothing', async () => {
  mockTourActive = true;
  await returnToToday(freshLaunch());
  expect(mockRequest).not.toHaveBeenCalled();
});

test('leaving Today within the second cancels the request', async () => {
  const hook = freshLaunch();
  const today = await renderHook(({ focused }: { focused: boolean }) => hook.useReviewRequestOnReturn(focused, false),
    { initialProps: { focused: false } });
  hook.noteOutfitDetailVisit();
  await act(async () => { today.rerender({ focused: true }); });
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(async () => { today.rerender({ focused: false }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a gate that fails to store never reaches the system prompt', async () => {
  mockMarkReviewRequested.mockRejectedValueOnce(new Error('disk'));
  await returnToToday(freshLaunch());
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a launch in which the consent sheet was still unanswered requests nothing', async () => {
  const hook = freshLaunch();
  mockConsent = 'undecided';
  const today = await renderHook(({ focused }: { focused: boolean }) => hook.useReviewRequestOnReturn(focused, false),
    { initialProps: { focused: true } });
  mockConsent = 'granted';
  await act(async () => { today.rerender({ focused: false }); });
  hook.noteOutfitDetailVisit();
  await act(async () => { today.rerender({ focused: true }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('an app leaving the foreground keeps its one request for later', async () => {
  AppState.currentState = 'background';
  await returnToToday(freshLaunch());
  expect(mockMarkReviewRequested).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});
