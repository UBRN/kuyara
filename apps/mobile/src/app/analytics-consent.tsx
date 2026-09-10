import { router, Stack } from 'expo-router';

import { useAnalyticsConsent } from '@/features/analytics/application/use-analytics-consent';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { AnalyticsConsentScreen } from '@/features/analytics/presentation/analytics-consent-screen';

export default function AnalyticsConsentRoute() {
  const consent = useAnalyticsConsent();
  useScreenViewed('analytics_consent_sheet');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AnalyticsConsentScreen
        onAccept={async () => {
          await consent.grant('first_launch_sheet');
          router.back();
        }}
        onDecline={async () => {
          await consent.decline();
          router.back();
        }}
      />
    </>
  );
}
