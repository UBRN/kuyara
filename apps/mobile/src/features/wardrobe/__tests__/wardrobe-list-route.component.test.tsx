import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

// The native control layer (ADR 0019) renders native views that do not mount under
// Jest, and the wrapper already has its own coverage in
// `components/ui/__tests__/segmented-control.component.test.tsx`. This screen test
// mocks the wrapper itself rather than its native dependency, which also keeps
// `features/` clear of that dependency's name, the boundary this repository greps for.
jest.mock('@/components/ui/segmented-control', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual('react-native');

  function MockSegmentedControl({
    onChange,
    options,
    testID,
    value,
  }: Readonly<{
    onChange: (value: string) => void;
    options: readonly Readonly<{ label: string; value: string }>[];
    testID?: string;
    value: string;
  }>) {
    return (
      <MockView testID={testID}>
        {options.map((option, index) => (
          <MockPressable
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === value }}
            key={option.value}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-segment-${index}` : undefined}
          />
        ))}
      </MockView>
    );
  }

  return { SegmentedControl: MockSegmentedControl };
});

type FocusEffect = () => void | (() => void);

let focusEffects: FocusEffect[] = [];
const mockUseFocusEffect = jest.fn((effect: FocusEffect) => {
  focusEffects.push(effect);
});

jest.mock('expo-router', () => {
  const push = jest.fn();
  const back = jest.fn();

  return {
    useFocusEffect: (effect: FocusEffect) => mockUseFocusEffect(effect),
    useIsFocused: () => true,
    useRouter: () => ({ back, push }),
    __mockBack: back,
    __mockPush: push,
  };
});

const { __mockBack: mockBack, __mockPush: mockPush } = jest.requireMock('expo-router') as {
  __mockBack: jest.Mock;
  __mockPush: jest.Mock;
};

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const item: WardrobeItem = {
  id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: 'City shell',
  category: 'outerwear',
  entryState: 'owned',
  garmentTypeId: 'rain_jacket',
  color: null,
  colorFamily: 'blue',
  thermalLevelOverride: null,
  waterProtectionOverride: null,
  windProtectionOverride: null,
  breathabilityOverride: null,
  armCoverageOverride: null,
  legCoverageOverride: null,
  tractionSuitabilityOverride: null,
  photoRelativePath: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  deletedAt: null,
};

function readyState(
  overrides: Partial<Extract<WardrobeApplicationState, { status: 'ready' }>> = {},
): WardrobeApplicationState {
  return {
    status: 'ready',
    items: [item],
    isRefreshing: false,
    isMutating: false,
    refreshFailure: null,
    ...overrides,
  };
}

function createApplication(items: readonly WardrobeItem[]): WardrobeApplicationValue {
  return {
    state: {
      status: 'ready',
      items,
      isRefreshing: false,
      isMutating: false,
      refreshFailure: null,
    },
    refresh: async () => undefined,
    getItem: async () => null,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => item,
    updateItem: async () => item,
    softDeleteItem: async () => item,
  };
}

// A scripted controller stand-in: `refreshOutcomes` is consumed one result per call to
// `refresh()`, mirroring how the real controller's `refresh()` settles into a new state.
function FakeWardrobeApplicationProvider({
  children,
  initialState,
  refreshOutcomes = [],
}: PropsWithChildren<{
  initialState: WardrobeApplicationState;
  refreshOutcomes?: readonly WardrobeApplicationState[];
}>) {
  const [state, setState] = useState(initialState);
  const [outcomes] = useState(() => [...refreshOutcomes]);
  const value: WardrobeApplicationValue = {
    state,
    refresh: async () => {
      const next = outcomes.shift();
      if (next) {
        setState(next);
      }
    },
    getItem: async () => null,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => item,
    updateItem: async () => item,
    softDeleteItem: async () => item,
  };

  return (
    <WardrobeApplicationContext.Provider value={value}>
      {children}
    </WardrobeApplicationContext.Provider>
  );
}

// Analytics, localization, theme and safe-area context only: the wardrobe application
// context is supplied by each test, either a static `createApplication` fixture or the
// stateful `FakeWardrobeApplicationProvider` below.
function TestProviders({
  analytics,
  children,
}: PropsWithChildren<{ analytics?: RecordingProductAnalytics }>) {
  return (
    <ProductAnalyticsProvider
      analytics={analytics ?? new RecordingProductAnalytics()}
      firstUseStore={new InMemoryFirstUseStore()}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            {children}
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </ProductAnalyticsProvider>
  );
}

async function renderRoute(items: readonly WardrobeItem[]) {
  return render(
    <TestProviders>
      <WardrobeApplicationContext.Provider value={createApplication(items)}>
        <WardrobeListRoute />
      </WardrobeApplicationContext.Provider>
    </TestProviders>,
  );
}

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  focusEffects = [];
});

// The plus bar button that replaces this action lives in the route file's
// `Stack.Screen` `headerRight`, not in `WardrobeListRoute`'s own tree, exactly as
// `profile.tsx`'s settings gear is untested at the route level; only the empty state's
// own "Add a piece" button is this component's to test.
test('the empty state add action navigates to the absolute new-item route', async () => {
  const result = await renderRoute([]);
  await fireEvent.press(result.getByTestId('wardrobe-empty-add-button'));
  expect(mockPush).toHaveBeenLastCalledWith('/wardrobe/new');
});

test('selecting an item navigates to its absolute edit route', async () => {
  const result = await renderRoute([item]);
  const tile = result.getByTestId(`wardrobe-item-${item.id}`);
  // ADR 0029 section 1: the user's own name, then the type as the subline.
  expect(tile.props.accessibilityLabel).toBe(
    `${item.name}. ${messages.en.catalog['catalog.garment_type.rain_jacket.name']}`,
  );
  await fireEvent.press(tile);
  expect(mockPush).toHaveBeenCalledWith(`/wardrobe/${item.id}`);
});

test('an initial entry state, passed by the route for ADR 0028\'s Wanted row, selects that filter on first render', async () => {
  const wantedItem = { ...item, id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', entryState: 'wanted' as const };
  const result = await render(
    <TestProviders>
      <WardrobeApplicationContext.Provider value={createApplication([item, wantedItem])}>
        <WardrobeListRoute initialEntryState="wanted" />
      </WardrobeApplicationContext.Provider>
    </TestProviders>,
  );

  expect(
    result.getByTestId('wardrobe-entry-filter-segment-1').props.accessibilityState.selected,
  ).toBe(true);
  expect(
    result.getByTestId('wardrobe-entry-filter-segment-0').props.accessibilityState.selected,
  ).toBe(false);
});

// `useScreenViewed('closet_list')` registers its `useFocusEffect` before the route's own,
// so index 0 is the screen view and index 1 is the route's auto-refresh-on-focus effect.
test('one screen_viewed for closet_list fires each time the route gains focus', async () => {
  const analytics = new RecordingProductAnalytics();
  await render(
    <TestProviders analytics={analytics}>
      <WardrobeApplicationContext.Provider value={createApplication([item])}>
        <WardrobeListRoute />
      </WardrobeApplicationContext.Provider>
    </TestProviders>,
  );

  expect(analytics.captures).toEqual([]);
  await act(() => {
    focusEffects[0]();
  });
  expect(analytics.captures).toEqual([
    {
      name: 'screen_viewed',
      properties: { schema_version: 2, screen_name: 'closet_list' },
      options: undefined,
    },
  ]);
});

test('the consent boundary drops a focused screen view before consent', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  await render(
    <TestProviders analytics={analytics}>
      <WardrobeApplicationContext.Provider value={createApplication([item])}>
        <WardrobeListRoute />
      </WardrobeApplicationContext.Provider>
    </TestProviders>,
  );

  await act(() => {
    focusEffects[0]();
  });
  expect(analytics.captures).toEqual([]);
});

test('the pull gesture captures a successful manual_refresh_triggered and the first-use signal', async () => {
  const analytics = new RecordingProductAnalytics();
  const result = await render(
    <TestProviders analytics={analytics}>
      <FakeWardrobeApplicationProvider
        initialState={readyState()}
        refreshOutcomes={[readyState()]}>
        <WardrobeListRoute />
      </FakeWardrobeApplicationProvider>
    </TestProviders>,
  );

  await act(async () => {
    result.getByTestId('wardrobe-list').props.onRefresh();
  });
  // `markFirstUse` resolves through the in-memory store's own promises, one microtask
  // past the synchronous `refresh()` state transition above.
  await act(async () => {
    await Promise.resolve();
  });

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'manual_refresh_triggered',
        properties: { schema_version: 2, surface: 'closet', result: 'success' },
        options: undefined,
      },
      {
        name: 'feature_used_first_time',
        properties: { schema_version: 2, feature_name: 'manual_refresh' },
        options: undefined,
      },
    ]),
  );
});

test('a retry button reports failure then success across two attempts, with attempt_number increasing', async () => {
  const analytics = new RecordingProductAnalytics();
  const result = await render(
    <TestProviders analytics={analytics}>
      <FakeWardrobeApplicationProvider
        initialState={readyState({ refreshFailure: 'unavailable' })}
        refreshOutcomes={[
          readyState({ refreshFailure: 'unavailable' }),
          readyState({ refreshFailure: null }),
        ]}>
        <WardrobeListRoute />
      </FakeWardrobeApplicationProvider>
    </TestProviders>,
  );

  const retryButton = result.getByRole('button', { name: messages.en.wardrobe.retryAction });
  await act(async () => {
    fireEvent.press(retryButton);
  });
  await act(async () => {
    fireEvent.press(retryButton);
  });

  const retryCaptures = analytics.captures.filter(
    (capture) => capture.name === 'retry_after_failure_triggered',
  );
  expect(retryCaptures).toEqual([
    {
      name: 'retry_after_failure_triggered',
      properties: {
        schema_version: 2,
        surface: 'closet',
        attempt_number: 1,
        result: 'failure',
      },
      options: undefined,
    },
    {
      name: 'retry_after_failure_triggered',
      properties: {
        schema_version: 2,
        surface: 'closet',
        attempt_number: 2,
        result: 'success',
      },
      options: undefined,
    },
  ]);
});

test('a refresh failure emits error_shown once and a later success emits error_recovered', async () => {
  const analytics = new RecordingProductAnalytics();
  await render(
    <TestProviders analytics={analytics}>
      <FakeWardrobeApplicationProvider
        initialState={readyState()}
        refreshOutcomes={[
          readyState({ refreshFailure: 'unavailable' }),
          readyState({ refreshFailure: 'unavailable' }),
          readyState({ refreshFailure: null }),
        ]}>
        <WardrobeListRoute />
      </FakeWardrobeApplicationProvider>
    </TestProviders>,
  );

  // Three automatic focus refreshes drive the underlying failure/recovery transitions.
  // The continuously visible failure is one episode; retry attempts are counted by the
  // separate `retry_after_failure_triggered` event.
  await act(async () => {
    focusEffects[1]();
  });
  await act(async () => {
    focusEffects[1]();
  });
  await act(async () => {
    focusEffects[1]();
  });

  expect(
    analytics.captures.filter((capture) => capture.name === 'error_shown'),
  ).toEqual([
    {
      name: 'error_shown',
      properties: {
        schema_version: 2,
        surface: 'closet',
        failure_category: 'unavailable',
        occurrence_count: 1,
      },
      options: expect.anything(),
    },
  ]);
  expect(
    analytics.captures.filter((capture) => capture.name === 'error_recovered'),
  ).toEqual([
    {
      name: 'error_recovered',
      properties: {
        schema_version: 2,
        surface: 'closet',
        failure_category: 'unavailable',
      },
      options: undefined,
    },
  ]);
});

test('an initial-load retry result survives the loading render and reports recovery on success', async () => {
  const analytics = new RecordingProductAnalytics();
  const result = await render(
    <TestProviders analytics={analytics}>
      <FakeWardrobeApplicationProvider
        initialState={{ status: 'error' }}
        refreshOutcomes={[readyState()]}>
        <WardrobeListRoute />
      </FakeWardrobeApplicationProvider>
    </TestProviders>,
  );

  await act(async () => {
    fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.retryAction }));
  });

  expect(analytics.captures.filter(
    ({ name }) => name === 'retry_after_failure_triggered',
  )).toEqual([{
    name: 'retry_after_failure_triggered',
    properties: {
      schema_version: 2,
      surface: 'closet',
      attempt_number: 1,
      result: 'success',
    },
    options: undefined,
  }]);
  expect(analytics.names().filter((name) => name === 'error_shown' || name === 'error_recovered'))
    .toEqual(['error_shown', 'error_recovered']);
});
