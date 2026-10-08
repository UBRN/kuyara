// Two properties of the adapter. First, consent gates emission and not only dispatch:
// `dispatchingEnabled: false` stops delivery but the native module still records the row, and
// a later flush sends everything past the cursor, so a pre-consent event would reach the
// server after a later grant. Second, the adapter never throws: `expo-observe` and
// `expo-app-metrics` call `requireNativeModule` at module scope, which fails wherever the
// native module is absent, and the adapter's require is guarded.
import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Text } from 'react-native';

import {
  configureObserveTelemetry,
  observePerformanceTelemetry,
  useObserveInteractiveMark,
  withObserveRoot,
} from '@/features/analytics/data/observe-performance-telemetry';
import { createLaunchVisibility } from '@/features/analytics/domain/launch-visibility';
import { TelemetryError } from '@/features/analytics/domain/performance-telemetry';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

// The spies are created inside the factory: `jest.mock` is hoisted above the imports, and
// the adapter requires `expo-observe` while those imports are evaluated, so a factory that
// closed over a module-scope constant would run before that constant exists.
jest.mock('expo-observe', () => {
  const Observe = {
    configure: jest.fn(),
    dispatchEvents: jest.fn().mockResolvedValue(undefined),
    logEvent: jest.fn(),
    reportError: jest.fn(),
    markInteractive: jest.fn(),
  };
  return {
    Observe,
    ObserveRoot: {
      wrap: (Component: ComponentType<Record<string, unknown>>) => Component,
    },
    useObserve: () => ({ markInteractive: Observe.markInteractive }),
  };
});

// The process's launch visibility, swapped per test; every test starts with a foreground launch.
type Visibility = import('@/features/analytics/domain/launch-visibility').LaunchVisibility;
let mockVisibility: Visibility;
jest.mock('@/features/analytics/data/launch-visibility', () => ({
  get launchVisibility() { return mockVisibility; },
}));

function launchStartingIn(initial: string) {
  let change: (state: string) => void = () => undefined;
  mockVisibility = createLaunchVisibility({
    initial,
    onChange: (listener) => {
      change = listener;
      return () => undefined;
    },
  });
  return { change: (state: string) => change(state) };
}

const mockObserve = (
  jest.requireMock('expo-observe') as {
    Observe: Record<'configure' | 'dispatchEvents' | 'logEvent' | 'reportError' | 'markInteractive', jest.Mock>;
  }
).Observe;

const error = new TelemetryError('profile.bootstrap_failed', { stage: 'migration' });
let storedConsent: AnalyticsConsent = 'undecided';
const readConsent = () => storedConsent;

function emitBoth() {
  observePerformanceTelemetry.logEvent('weather.refreshed', {
    duration_ms: 10,
    outcome: 'success',
  });
  observePerformanceTelemetry.reportError(error);
}

function expectNothingRecorded() {
  expect(mockObserve.logEvent).not.toHaveBeenCalled();
  expect(mockObserve.reportError).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  storedConsent = 'undecided';
  launchStartingIn('active');
});

describe('the Observe adapter and consent', () => {
  // Must stay first: the adapter is a module singleton and this is the only point at which
  // it has not been configured yet.
  it('records nothing before the root layout has configured it', () => {
    emitBoth();

    expect(mockObserve.configure).not.toHaveBeenCalled();
    expectNothingRecorded();
  });

  it('records nothing while consent is undecided or withdrawn', () => {
    configureObserveTelemetry({ dispatchingEnabled: false, readConsent });

    emitBoth();

    expect(mockObserve.configure).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchingEnabled: false }),
    );
    expectNothingRecorded();
  });

  it('records once consent is granted', () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });

    emitBoth();

    expect(mockObserve.logEvent).toHaveBeenCalledTimes(1);
    expect(mockObserve.logEvent).toHaveBeenCalledWith('weather.refreshed', {
      attributes: { duration_ms: 10, outcome: 'success' },
    });
    expect(mockObserve.reportError).toHaveBeenCalledWith(error);
  });

  it('finishes a disabled dispatch before enabling delivery after a grant', async () => {
    configureObserveTelemetry({ dispatchingEnabled: false, readConsent });
    let finishDispatch!: () => void;
    mockObserve.dispatchEvents.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishDispatch = resolve;
    }));

    storedConsent = 'granted';
    const grant = observePerformanceTelemetry.setDispatching(true);

    expect(mockObserve.dispatchEvents).toHaveBeenCalledTimes(1);
    expect(mockObserve.configure).toHaveBeenCalledTimes(1);
    expect(mockObserve.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ dispatchingEnabled: false }),
    );
    finishDispatch();
    await grant;

    expect(mockObserve.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ dispatchingEnabled: true }),
    );
  });

  it('discards the unanswered period only while delivery is disabled', async () => {
    configureObserveTelemetry({ dispatchingEnabled: false, readConsent });
    await observePerformanceTelemetry.discardPending();
    expect(mockObserve.dispatchEvents).toHaveBeenCalledTimes(1);

    storedConsent = 'granted';
    await observePerformanceTelemetry.setDispatching(true);
    mockObserve.dispatchEvents.mockClear();
    await observePerformanceTelemetry.discardPending();
    expect(mockObserve.dispatchEvents).not.toHaveBeenCalled();
  });

  it('does not enable delivery if consent is withdrawn during the cursor flush', async () => {
    configureObserveTelemetry({ dispatchingEnabled: false, readConsent });
    let finishDispatch!: () => void;
    mockObserve.dispatchEvents.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishDispatch = resolve;
    }));

    storedConsent = 'granted';
    const grant = observePerformanceTelemetry.setDispatching(true);
    storedConsent = 'withdrawn';
    await observePerformanceTelemetry.setDispatching(false);
    finishDispatch();
    await grant;

    expect(mockObserve.configure).not.toHaveBeenCalledWith(
      expect.objectContaining({ dispatchingEnabled: true }),
    );
  });

  it('rejects a failed disabled dispatch and leaves delivery off', async () => {
    configureObserveTelemetry({ dispatchingEnabled: false, readConsent });
    mockObserve.dispatchEvents.mockRejectedValueOnce(new Error('dispatch failed'));
    storedConsent = 'granted';

    await expect(observePerformanceTelemetry.setDispatching(true))
      .rejects.toThrow('dispatch failed');
    expect(observePerformanceTelemetry.isApplied()).toBe(false);
    expect(mockObserve.configure).not.toHaveBeenCalledWith(
      expect.objectContaining({ dispatchingEnabled: true }),
    );
  });

  it('stops recording the moment consent is withdrawn, and resumes on a later grant', async () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });

    storedConsent = 'withdrawn';
    await observePerformanceTelemetry.setDispatching(false);
    emitBoth();
    expectNothingRecorded();
    expect(mockObserve.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ dispatchingEnabled: false }),
    );

    storedConsent = 'granted';
    await observePerformanceTelemetry.setDispatching(true);
    emitBoth();
    expect(mockObserve.logEvent).toHaveBeenCalledTimes(1);
    expect(mockObserve.reportError).toHaveBeenCalledTimes(1);
  });

  it('stored withdrawal gates JS emission even when native reconfiguration fails', () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });
    storedConsent = 'withdrawn';
    mockObserve.configure.mockImplementationOnce(() => { throw new Error('native configure failed'); });

    expect(() => observePerformanceTelemetry.setDispatching(false))
      .toThrow('native configure failed');
    emitBoth();
    expectNothingRecorded();
    mockObserve.configure.mockReset();
  });
});

describe('the Observe adapter outside a real build', () => {
  it('never throws from configuration or from the port', async () => {
    expect(() => configureObserveTelemetry({ dispatchingEnabled: false })).not.toThrow();
    expect(() => configureObserveTelemetry({ dispatchingEnabled: true })).not.toThrow();
    expect(() => emitBoth()).not.toThrow();
    await expect(observePerformanceTelemetry.setDispatching(false)).resolves.toBeUndefined();
    await expect(observePerformanceTelemetry.setDispatching(true)).resolves.toBeUndefined();
  });

  it('renders the wrapped tree and marks interactive without throwing', async () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });

    function Content() {
      const markInteractive = useObserveInteractiveMark();
      markInteractive({ state: 'loaded' });
      return <Text>content</Text>;
    }
    const Wrapped = withObserveRoot(Content);

    const view = await render(<Wrapped />);

    expect(view.getByText('content')).toBeTruthy();
    expect(mockObserve.markInteractive).toHaveBeenCalledWith({
      params: { state: 'loaded' },
    });
  });
});

// iOS starts kuyara in the background for the weather-alert task and renders the UI off
// screen. Observe times the interactive mark from the native launch, so that launch is never
// marked: not off screen, and not after the person opens it, when the mark would count the
// whole wait since the unseen start.
describe('the interactive mark and an unseen launch', () => {
  function Marking({ label }: Readonly<{ label: string }>) {
    const markInteractive = useObserveInteractiveMark();
    markInteractive({ state: 'loaded' });
    return <Text>{label}</Text>;
  }

  it('marks nothing for a launch that started in the background, even once it is opened', async () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });
    const appState = launchStartingIn('background');

    await render(<Marking label="off screen" />);
    appState.change('active');
    await render(<Marking label="opened" />);

    expect(mockObserve.markInteractive).not.toHaveBeenCalled();
  });

  it('marks a background start that was opened before its first mark', async () => {
    storedConsent = 'granted';
    configureObserveTelemetry({ dispatchingEnabled: true, readConsent });
    launchStartingIn('background').change('active');

    await render(<Marking label="opened" />);

    expect(mockObserve.markInteractive).toHaveBeenCalledTimes(1);
  });
});
