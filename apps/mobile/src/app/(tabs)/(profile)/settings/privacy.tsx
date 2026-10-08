import { Stack } from 'expo-router';
import { useState } from 'react';
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
  // The kept identifier, read again whenever the answer changes: withdrawing keeps one,
  // granting clears it. Removing it only shows as gone once the file is gone.
  const [withdrawn, setWithdrawn] = useState({
    answer: consent.consent,
    identifier: consent.getWithdrawnIdentifier(),
  });
  if (withdrawn.answer !== consent.consent) {
    setWithdrawn({ answer: consent.consent, identifier: consent.getWithdrawnIdentifier() });
  }
  // The stored answer can re-render this route before the new identifier exists, so the
  // identifier is read again once the grant has finished.
  const [, refreshIdentifier] = useState(0);

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
        withdrawnIdentifier={withdrawn.identifier}
        onRemoveWithdrawnIdentifier={() => {
          try {
            consent.removeWithdrawnIdentifier();
            setWithdrawn((current) => ({ ...current, identifier: null }));
          } catch {
            // A file that cannot be deleted stays, and so does the row that shows it.
          }
        }}
        onGrant={async () => {
          await consent.grant('settings_privacy');
          refreshIdentifier((revision) => revision + 1);
        }}
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
