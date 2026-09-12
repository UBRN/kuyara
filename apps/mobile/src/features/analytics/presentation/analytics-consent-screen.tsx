import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText, Button, Screen } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type AnalyticsConsentScreenProps = Readonly<{
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}>;

export function AnalyticsConsentScreen({
  onAccept,
  onDecline,
}: AnalyticsConsentScreenProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const [isAnswering, setIsAnswering] = useState(false);
  const entranceProgress = useSharedValue(0);
  // Effects motion only: the sheet's own system transition carries the spatial move.
  const entranceStyle = useAnimatedStyle(() => ({ opacity: entranceProgress.get() }));

  useEffect(() => {
    if (theme.isReduceMotionEnabled) return;
    entranceProgress.set(withTiming(1, { duration: theme.motion.fast }));
    return () => cancelAnimation(entranceProgress);
  }, [entranceProgress, theme.isReduceMotionEnabled, theme.motion.fast]);

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
      <Animated.View
        style={[styles.entrance, !theme.isReduceMotionEnabled && entranceStyle]}
        testID="analytics-consent-content">
        <View style={styles.copy}>
          <AppText accessibilityRole="header" variant="title">
            {messages.analytics.consentTitle}
          </AppText>
          <View style={styles.paragraphs}>
            <AppText colorRole="textSecondary">
              {messages.analytics.consentBody}
            </AppText>
            <AppText colorRole="textSecondary">
              {messages.analytics.consentSettingsBody}
            </AppText>
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            disabled={isAnswering}
            label={messages.analytics.acceptAction}
            onPress={() => void answer(onAccept)}
            style={styles.action}
            testID="analytics-consent-accept"
            variant="primary"
          />
          <Button
            disabled={isAnswering}
            label={messages.analytics.declineAction}
            onPress={() => void answer(onDecline)}
            style={styles.action}
            testID="analytics-consent-decline"
            variant="secondary"
          />
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The sheet is an overlay: its edge-to-content inset is lg, groups sit md apart and
  // siblings sm apart (design-language Law 2). Screen owns the bottom inset.
  content: {
    paddingTop: spacing.lg,
  },
  entrance: {
    gap: spacing.md,
  },
  copy: {
    gap: spacing.md,
  },
  paragraphs: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    width: '100%',
  },
});
