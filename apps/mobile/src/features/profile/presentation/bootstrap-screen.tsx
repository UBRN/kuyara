import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import type { ProfileBootstrapFailureReason } from '@/features/profile/application/profile-application-controller';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type BootstrapScreenProps =
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      status: 'error';
      reason: ProfileBootstrapFailureReason;
      onRetry: () => void;
      onReportProblem: () => void;
    }>;

export function BootstrapScreen(props: BootstrapScreenProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const isLoading = props.status === 'loading';

  return (
    <Screen
      contentContainerStyle={styles.content}
      fill
      testID={`bootstrap-${props.status}-screen`}>
      <Surface
        accessibilityLiveRegion={isLoading ? 'polite' : 'assertive'}
        accessibilityRole={isLoading ? undefined : 'alert'}
        style={styles.card}
        variant="elevated">
        {isLoading ? (
          <ActivityIndicator
            accessibilityLabel={messages.bootstrap.loadingBody}
            color={theme.colors.iconSecondary}
            size="large"
          />
        ) : null}
        <AppText accessibilityRole="header" style={styles.centered} variant="title">
          {isLoading
            ? messages.bootstrap.loadingTitle
            : messages.bootstrap.errorTitle}
        </AppText>
        <AppText colorRole="textSecondary" style={styles.centered}>
          {isLoading
            ? messages.bootstrap.loadingBody
            : messages.bootstrap.errorBody}
        </AppText>
        {props.status === 'error' ? (
          <>
            <AppText colorRole="textSecondary" style={styles.centered}>
              {messages.bootstrap.errorReasonBodies[props.reason]}
            </AppText>
            <Button
              label={messages.bootstrap.retryAction}
              onPress={props.onRetry}
              testID="bootstrap-retry"
            />
            <Button
              label={messages.bootstrap.reportAction}
              onPress={props.onReportProblem}
              testID="bootstrap-report"
              variant="quiet"
            />
          </>
        ) : null}
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 520,
    padding: spacing.lg,
    width: '100%',
  },
  centered: {
    textAlign: 'center',
  },
});
