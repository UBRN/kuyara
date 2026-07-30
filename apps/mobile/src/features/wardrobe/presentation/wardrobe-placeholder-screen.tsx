import { StyleSheet } from 'react-native';

import { AppText, Screen, Surface } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export function WardrobePlaceholderScreen() {
  const copy = useMessages().wardrobe;

  return (
    <Screen contentContainerStyle={styles.content} testID="wardrobe-screen">
      <Surface style={styles.card} variant="elevated">
        <AppText accessibilityRole="header" variant="titleLarge">
          {copy.title}
        </AppText>
        <AppText colorRole="textSecondary">{copy.placeholderBody}</AppText>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    paddingBottom: spacing['2xl'],
    paddingTop: spacing['2xl'],
  },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
  },
});
