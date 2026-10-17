import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { LaunchOpenContext } from '@/components/ui/launch-curtain';
import { usePresentationHold } from '@/components/ui/presentation-hold';
import {
  resetReviewRequestProcess,
  REVIEW_REQUEST_SETTLE_MS,
  ReviewRequestObserver,
} from '@/features/feedback/application/review-request-observer';

const mockRequest = jest.fn(async () => undefined);
let mockOnboardingCompleted = true;

jest.mock('@/features/feedback/data/store-review', () => ({ requestStoreReview: () => mockRequest() }));
jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({
    state: { status: 'ready', profile: { onboardingCompleted: mockOnboardingCompleted } },
  }),
}));

// Anything presented over the screen holds it, as a sheet, a prompt, the tour or a curtain does.
function Presented({ held }: Readonly<{ held: boolean }>) {
  usePresentationHold(held);
  return null;
}

// `open` is the launch's count of opens: the cold launch is 0, each return that plays the
// launch adds one.
const app = (open = 0, held = false) => (
  <LaunchOpenContext value={open}>
    <Presented held={held} />
    <ReviewRequestObserver />
  </LaunchOpenContext>
);

let appStateListeners: ((state: AppStateStatus) => void)[] = [];
async function moveApp(state: AppStateStatus) {
  AppState.currentState = state;
  await act(() => appStateListeners.forEach((listener) => listener(state)));
}

async function settle() {
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS));
}

beforeEach(() => {
  jest.useFakeTimers();
  resetReviewRequestProcess();
  mockRequest.mockClear();
  mockOnboardingCompleted = true;
  AppState.currentState = 'active';
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    appStateListeners.push(listener);
    return { remove: () => { appStateListeners = appStateListeners.filter((item) => item !== listener); } };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('finishing onboarding asks on the first Today once nothing is presented over it', async () => {
  mockOnboardingCompleted = false;
  const view = await render(app());
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  mockOnboardingCompleted = true;
  await view.rerender(app());
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS - 1));
  expect(mockRequest).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('a later cold launch asks again', async () => {
  const first = await render(app());
  await settle();
  await first.unmount();

  // A new process: nothing asked in it yet.
  resetReviewRequestProcess();
  await render(app());
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('a return that plays the return launch asks again; a shorter one, the same open, does not', async () => {
  const view = await render(app(0));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  // A 20 s return plays no launch, so it is still the cold launch's open.
  await moveApp('background');
  await act(() => jest.advanceTimersByTime(20_000));
  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  await view.rerender(app(1));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('a sheet holds the request; once it closes the open asks once, and no more', async () => {
  const view = await render(app(0, true));
  await act(() => jest.advanceTimersByTime(60_000));
  expect(mockRequest).not.toHaveBeenCalled();

  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  await view.rerender(app(0, true));
  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('something presented within the settling time holds the request back until it closes', async () => {
  const view = await render(app());
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS - 1));
  await view.rerender(app(0, true));
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('an app that is not active asks nothing, and asks once it is active again', async () => {
  await render(app());
  await moveApp('inactive');
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

// iOS can suspend the process before this thread hears the change, so the request reads the
// app's state when it fires.
test('an app found not active when the request fires asks nothing then, and asks once it is active', async () => {
  await render(app());
  AppState.currentState = 'background';
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('Android asks nothing', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const view = await render(app(0));
  await settle();
  await view.rerender(app(1));
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();
});
