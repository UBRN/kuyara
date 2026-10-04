import { Stack } from 'expo-router';
import { Linking } from 'react-native';

import { useAnalyticsConsent } from '@/features/analytics/application/use-analytics-consent';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PrivacySettingsScreen } from '@/features/profile/presentation/privacy-settings-screen';
import { useLocalization } from '@/localization/use-messages';

function ReadyPrivacySettingsRoute() {
  const { language, messages } = useLocalization();
  const consent = useAnalyticsConsent();
  const privacyPolicyUrl: string | null = PRIVACY_POLICY_URL[language];
  useScreenViewed('settings_privacy');

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.analytics.privacyTitle,
        }}
      />
      <PrivacySettingsScreen
        consent={consent.consent}
        identifier={consent.getIdentifier()}
        onGrant={() => consent.grant('settings_privacy')}
        onOpenPrivacyPolicy={() => {
          if (privacyPolicyUrl) void Linking.openURL(privacyPolicyUrl).catch(() => {
            // A link the system cannot open leaves the screen as it was; nothing is lost.
          });
        }}
        onWithdraw={consent.withdraw}
        privacyPolicyUrl={privacyPolicyUrl}
      />
    </>
  );
}

export default function PrivacySettingsRoute() {
  const { state } = useProfileApplication();

  if (state.status !== 'ready') return null;
  return <ReadyPrivacySettingsRoute />;
}
