import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText, Screen, Surface } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type BootstrapScreenProps = Readonly<{
  status: 'loading' | 'error';
}>;

export function BootstrapScreen({ status }: BootstrapScreenProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const isLoading = status === 'loading';

  return (
    <Screen
      contentContainerStyle={styles.content}
      testID={`bootstrap-${status}-screen`}>
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
    gap: spacing.lg,
    maxWidth: 520,
    padding: spacing.lg,
    width: '100%',
  },
  centered: {
    textAlign: 'center',
  },
});
