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
import { TelemetryError } from '@/features/analytics/domain/performance-telemetry';

// The spies are created inside the factory: `jest.mock` is hoisted above the imports, and
// the adapter requires `expo-observe` while those imports are evaluated, so a factory that
// closed over a module-scope constant would run before that constant exists.
jest.mock('expo-observe', () => {
  const Observe = {
    configure: jest.fn(),
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

const mockObserve = (
  jest.requireMock('expo-observe') as {
    Observe: Record<'configure' | 'logEvent' | 'reportError' | 'markInteractive', jest.Mock>;
  }
).Observe;

const error = new TelemetryError('profile.bootstrap_failed', { stage: 'migration' });

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
    configureObserveTelemetry({ dispatchingEnabled: false });

    emitBoth();

    expect(mockObserve.configure).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchingEnabled: false }),
    );
    expectNothingRecorded();
  });

  it('records once consent is granted', () => {
    configureObserveTelemetry({ dispatchingEnabled: true });

    emitBoth();

    expect(mockObserve.logEvent).toHaveBeenCalledTimes(1);
    expect(mockObserve.logEvent).toHaveBeenCalledWith('weather.refreshed', {
      attributes: { duration_ms: 10, outcome: 'success' },
    });
    expect(mockObserve.reportError).toHaveBeenCalledWith(error);
  });

  it('stops recording the moment consent is withdrawn, and resumes on a later grant', () => {
    configureObserveTelemetry({ dispatchingEnabled: true });

    observePerformanceTelemetry.setDispatching(false);
    emitBoth();
    expectNothingRecorded();
    expect(mockObserve.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ dispatchingEnabled: false }),
    );

    observePerformanceTelemetry.setDispatching(true);
    emitBoth();
    expect(mockObserve.logEvent).toHaveBeenCalledTimes(1);
    expect(mockObserve.reportError).toHaveBeenCalledTimes(1);
  });
});

describe('the Observe adapter outside a real build', () => {
  it('never throws from configuration or from the port', () => {
    expect(() => configureObserveTelemetry({ dispatchingEnabled: false })).not.toThrow();
    expect(() => configureObserveTelemetry({ dispatchingEnabled: true })).not.toThrow();
    expect(() => emitBoth()).not.toThrow();
    expect(() => observePerformanceTelemetry.setDispatching(false)).not.toThrow();
    expect(() => observePerformanceTelemetry.setDispatching(true)).not.toThrow();
  });

  it('renders the wrapped tree and marks interactive without throwing', async () => {
    configureObserveTelemetry({ dispatchingEnabled: true });

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
