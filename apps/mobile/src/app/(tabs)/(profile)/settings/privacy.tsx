import { Stack } from 'expo-router';
import { Linking } from 'react-native';

import { useAnalyticsConsent } from '@/features/analytics/application/use-analytics-consent';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PrivacySettingsScreen } from '@/features/profile/presentation/privacy-settings-screen';
import { useMessages } from '@/localization/use-messages';

function ReadyPrivacySettingsRoute() {
  const messages = useMessages();
  const consent = useAnalyticsConsent();
  const privacyPolicyUrl: string | null = PRIVACY_POLICY_URL;

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
          if (privacyPolicyUrl) void Linking.openURL(privacyPolicyUrl);
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
