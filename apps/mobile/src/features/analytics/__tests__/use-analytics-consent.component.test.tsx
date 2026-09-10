import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import {
  type AnalyticsConsentControls,
  useAnalyticsConsent,
} from '@/features/analytics/application/use-analytics-consent';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';

function Harness({ onReady }: Readonly<{ onReady: (value: AnalyticsConsentControls) => void }>) {
  const consent = useAnalyticsConsent();
  onReady(consent);
  return <Text>{consent.consent}</Text>;
}

const profile = {
  id: 'profile-id',
  gender: 'woman' as const,
  clothingPreference: 'womens' as const,
  dressStyle: 'smart' as const,
  birthDate: null,
  languagePreference: 'en' as const,
  themePreference: 'light' as const,
  onboardingCompleted: true,
  notificationsOptIn: false,
  analyticsConsent: 'undecided' as const,
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

test('grant, withdrawal, and decline use the required operation order', async () => {
  const operations: string[] = [];
  const resetErrors = jest.spyOn(ErrorEpisodeTracker.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetErrors'); });
  const resetRetries = jest.spyOn(RetryCounter.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetRetries'); });
  const analytics: ProductAnalytics = {
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => 'analytics-id',
    getSessionId: () => 'session-id',
    optIn: async (surface) => { operations.push(`optIn:${surface}`); },
    decline: async () => { operations.push('decline'); },
    withdraw: async () => { operations.push('withdraw'); },
  };
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider
        analytics={analytics}
        firstUseStore={{
          has: async () => false,
          markUsed: async () => undefined,
          clear: async () => { operations.push('clearFirstUses'); },
        }}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );
  await controls.grant('first_launch_sheet');
  await controls.withdraw();
  await controls.decline();

  expect(operations).toEqual([
    'persist:granted',
    'optIn:first_launch_sheet',
    'persist:withdrawn',
    'withdraw',
    'clearFirstUses',
    'resetErrors',
    'resetRetries',
    'persist:withdrawn',
    'decline',
  ]);
  expect(controls.getIdentifier()).toBe('analytics-id');
  resetErrors.mockRestore();
  resetRetries.mockRestore();
});

test('a failed grant persistence never opts the provider in', async () => {
  const operations: string[] = [];
  const analytics: ProductAnalytics = {
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => null,
    getSessionId: () => null,
    optIn: async () => { operations.push('optIn'); },
    decline: async () => undefined,
    withdraw: async () => undefined,
  };
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
      throw new Error('persistence unavailable');
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider analytics={analytics}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );

  await expect(controls.grant('first_launch_sheet')).rejects.toThrow(
    'persistence unavailable',
  );
  expect(operations).toEqual(['persist:granted']);
});

test('re-consent clears tracker state accumulated while withdrawn before opting in', async () => {
  const operations: string[] = [];
  const resetErrors = jest.spyOn(ErrorEpisodeTracker.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetErrors'); });
  const resetRetries = jest.spyOn(RetryCounter.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetRetries'); });
  const analytics: ProductAnalytics = {
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => null,
    getSessionId: () => null,
    optIn: async (surface) => { operations.push(`optIn:${surface}`); },
    decline: async () => undefined,
    withdraw: async () => undefined,
  };
  const application = {
    state: {
      status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'withdrawn' as const },
      isSaving: false,
    },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider
        analytics={analytics}
        firstUseStore={{
          has: async () => false,
          markUsed: async () => undefined,
          clear: async () => { operations.push('clearFirstUses'); },
        }}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );
  await controls.grant('settings_privacy');

  expect(operations).toEqual([
    'persist:granted',
    'resetErrors',
    'resetRetries',
    'clearFirstUses',
    'optIn:settings_privacy',
  ]);
  resetErrors.mockRestore();
  resetRetries.mockRestore();
});
