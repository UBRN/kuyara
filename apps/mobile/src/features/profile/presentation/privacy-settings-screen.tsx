import { use, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
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
  const analytics = use(ProductAnalyticsContext)?.analytics;
  const telemetry = usePerformanceTelemetry();
  const [providerSettled, setProviderSettled] = useState(analytics === undefined);
  const [, refreshApplied] = useState(0);
  const [isChanging, setIsChanging] = useState(false);
  const changePending = useRef(false);
  const [failedChange, setFailedChange] = useState<'grant' | 'withdraw' | null>(null);
  const isGranted = consent === 'granted';
  const isApplied = (analytics?.isApplied() ?? true) && telemetry.isApplied();
  const cleanupPending = analytics?.isCleanupPending() ?? false;
  const withdrawalRetryRequired = isGranted && (analytics?.isWithdrawalInProgress() ?? false);
  // A failed grant can leave a stored answer without an applied provider grant if its
  // rollback also fails. Keep that state visibly incomplete and offer an explicit retry.
  const failureMessage = failedChange === 'withdraw' || withdrawalRetryRequired
    ? isGranted ? messages.analytics.withdrawFailed : messages.analytics.withdrawIncomplete
    : failedChange === 'grant'
      ? isGranted ? messages.analytics.grantIncomplete : messages.analytics.grantFailed
      : isGranted && providerSettled && !isChanging && !isApplied
        ? messages.analytics.grantIncomplete
        : !isGranted && cleanupPending ? messages.analytics.withdrawIncomplete : null;

  useEffect(() => {
    let mounted = true;
    if (analytics) {
      void analytics.whenReady().then(() => {
        if (mounted) setProviderSettled(true);
      });
    }
    return () => { mounted = false; };
  }, [analytics]);

  useEffect(() => {
    if (failureMessage) AccessibilityInfo.announceForAccessibility(failureMessage);
  }, [failureMessage]);

  const changeConsent = async (value: boolean) => {
    if (changePending.current) return;
    changePending.current = true;
    setIsChanging(true);
    setFailedChange(null);
    try {
      await (value ? onGrant() : onWithdraw());
      refreshApplied((revision) => revision + 1);
    } catch {
      // The error itself stays out of logs; only which change failed is kept.
      setFailedChange(value ? 'grant' : 'withdraw');
    } finally {
      changePending.current = false;
      setIsChanging(false);
    }
  };

  return (
    <NativeList testID="settings-privacy-screen">
      <NativeListSection
        footer={isChanging ? undefined : failureMessage ?? messages.analytics.toggleFooter}
        testID="settings-privacy-consent-group">
        <NativeListRow
          label={messages.analytics.shareUsageData}
          testID="settings-privacy-toggle-row"
          toggle={{
            disabled: isChanging || (isGranted && (!providerSettled || failedChange === 'withdraw' || withdrawalRetryRequired)),
            onValueChange: (value) => void changeConsent(value),
            value: isGranted,
          }}
        />
        {(failedChange === 'withdraw' || withdrawalRetryRequired || (!isGranted && cleanupPending)) ? (
          <NativeListRow
            label={messages.analytics.retryWithdraw}
            onPress={() => void changeConsent(false)}
            testID="settings-privacy-retry-withdraw-row"
          />
        ) : null}
        {isGranted && providerSettled && !isChanging && failedChange !== 'withdraw' && !withdrawalRetryRequired && (!isApplied || failedChange === 'grant') ? (
          <NativeListRow
            label={messages.analytics.retryGrant}
            onPress={() => void changeConsent(true)}
            testID="settings-privacy-retry-grant-row"
          />
        ) : null}
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
