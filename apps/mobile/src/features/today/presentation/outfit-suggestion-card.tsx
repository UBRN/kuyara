import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Pill } from '@/components/ui';
import type { LoadedOutfitPresentation } from '@/features/today/presentation/today-presentation';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type OutfitSuggestionCardVariant = 'primary' | 'secondary';

type OutfitSuggestionCardProps = Readonly<{
  suggestion: LoadedOutfitPresentation;
  variant: OutfitSuggestionCardVariant;
  onPress: () => void;
}>;

export function OutfitSuggestionCard({
  suggestion,
  variant,
  onPress,
}: OutfitSuggestionCardProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityLabel={suggestion.accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isPrimary ? styles.primaryCard : styles.secondaryCard,
        {
          borderColor: isPrimary ? theme.colors.borderStrong : theme.colors.borderSubtle,
          backgroundColor: theme.colors.surface,
        },
        pressed && {
          borderColor: isPrimary ? theme.colors.textPrimary : theme.colors.focusRing,
          backgroundColor: isPrimary ? theme.colors.surfaceInteractive : theme.colors.surface,
        },
      ]}
      testID={`outfit-card-${suggestion.id}`}>
      <View style={[styles.headingRow, usesStackedLayout && styles.stackedHeadingRow]}>
        <AppText style={styles.title} variant={isPrimary ? 'title' : 'bodyStrong'}>
          {suggestion.title}
        </AppText>
        {suggestion.emphasis ? (
          isPrimary ? (
            <Pill label={suggestion.emphasis} tone="accent-filled" />
          ) : (
            <AppText colorRole="brandAccent" variant="eyebrow">
              {suggestion.emphasis}
            </AppText>
          )
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.chevronRow}>
        <AppText colorRole="brandAccent">→</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: borderWidths.subtle,
    gap: spacing.sm,
  },
  primaryCard: {
    padding: spacing.xl,
  },
  secondaryCard: {
    padding: spacing.lg,
  },
  headingRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  stackedHeadingRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  title: {
    flex: 1,
    flexShrink: 1,
  },
  decisionText: {
    marginTop: -spacing.xs,
  },
  chevronRow: {
    alignItems: 'flex-end',
  },
});
