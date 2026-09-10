import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, useTextScaling } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type AnalyticsConsentScreenProps = Readonly<{
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}>;

export function AnalyticsConsentScreen({
  onAccept,
  onDecline,
}: AnalyticsConsentScreenProps) {
  const messages = useMessages();
  const { usesStackedLayout } = useTextScaling();
  const [isAnswering, setIsAnswering] = useState(false);

  const answer = async (operation: () => Promise<void>) => {
    if (isAnswering) return;
    setIsAnswering(true);
    try {
      await operation();
    } catch {
      // There is no approved error copy. A failed answer leaves the route open so the user
      // can retry, and the provider error is intentionally kept out of logs.
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content} testID="analytics-consent-screen">
      <View style={styles.copy}>
        <AppText accessibilityRole="header" variant="title">
          {messages.analytics.consentTitle}
        </AppText>
        <AppText colorRole="textSecondary">
          {messages.analytics.consentBody}
        </AppText>
        <AppText colorRole="textSecondary">
          {messages.analytics.consentSettingsBody}
        </AppText>
      </View>
      <View style={[styles.actions, usesStackedLayout && styles.actionsStacked]}>
        <Button
          disabled={isAnswering}
          label={messages.analytics.acceptAction}
          onPress={() => void answer(onAccept)}
          style={usesStackedLayout ? styles.actionStacked : styles.action}
          testID="analytics-consent-accept"
          variant="secondary"
        />
        <Button
          disabled={isAnswering}
          label={messages.analytics.declineAction}
          onPress={() => void answer(onDecline)}
          style={usesStackedLayout ? styles.actionStacked : styles.action}
          testID="analytics-consent-decline"
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },
  copy: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  action: {
    flex: 1,
  },
  actionStacked: {
    width: '100%',
  },
});
