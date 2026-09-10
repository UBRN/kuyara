import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type PrivacySettingsScreenProps = Readonly<{
  consent: AnalyticsConsent;
  identifier: string | null;
  privacyPolicyUrl: string | null;
  onGrant: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onOpenPrivacyPolicy: () => void;
}>;

export function PrivacySettingsScreen({
  consent,
  identifier,
  onGrant,
  onOpenPrivacyPolicy,
  onWithdraw,
  privacyPolicyUrl,
}: PrivacySettingsScreenProps) {
  const messages = useMessages();
  const [isChanging, setIsChanging] = useState(false);
  const isGranted = consent === 'granted';

  const changeConsent = async (value: boolean) => {
    if (isChanging) return;
    setIsChanging(true);
    try {
      await (value ? onGrant() : onWithdraw());
    } catch {
      // There is no approved error copy. Clearing the pending state below re-renders this
      // controlled toggle from the latest profile value, and the error stays out of logs.
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <NativeList testID="settings-privacy-screen">
      <NativeListSection
        footer={messages.analytics.toggleFooter}
        testID="settings-privacy-consent-group">
        <NativeListRow
          label={messages.analytics.shareUsageData}
          testID="settings-privacy-toggle-row"
          toggle={{
            disabled: isChanging,
            onValueChange: (value) => void changeConsent(value),
            value: isGranted,
          }}
        />
      </NativeListSection>

      {isGranted && identifier ? (
        <NativeListSection
          footer={
            <View style={styles.identifierFooter}>
              <AppText
                colorRole="textSecondary"
                selectable
                testID="settings-privacy-identifier"
                variant="code">
                {identifier}
              </AppText>
              <AppText colorRole="textSecondary" variant="caption">
                {messages.analytics.identifierFooter}
              </AppText>
            </View>
          }
          testID="settings-privacy-identifier-group">
          <NativeListRow
            label={messages.analytics.identifierLabel}
            testID="settings-privacy-identifier-row"
          />
        </NativeListSection>
      ) : null}

      {privacyPolicyUrl ? (
        <NativeListSection testID="settings-privacy-policy-group">
          <NativeListRow
            label={messages.analytics.privacyPolicyLabel}
            onPress={onOpenPrivacyPolicy}
            testID="settings-privacy-policy-row"
          />
        </NativeListSection>
      ) : null}
    </NativeList>
  );
}

const styles = StyleSheet.create({
  identifierFooter: {
    gap: spacing.xs,
  },
});
