import { Fragment } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, GarmentSlotGlyph, GarmentSlotTile, Icon, Pill, Surface } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import type { LoadedOutfitPresentation } from '@/features/today/presentation/today-presentation';
import { radii, spacing } from '@/theme/theme';
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
      style={[
        !isPrimary && styles.secondaryPressable,
        !isPrimary && usesStackedLayout && styles.stackedSecondaryPressable,
      ]}
      testID={`outfit-card-${suggestion.id}`}>
      {({ pressed }) => (
        <Surface
          style={[
            styles.card,
            isPrimary ? styles.primaryCard : styles.secondaryCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderSubtle,
            },
            pressed && {
              borderColor: theme.colors.focusRing,
              backgroundColor: theme.colors.surfaceInteractive,
            },
          ]}
          testID={`outfit-card-${suggestion.id}-surface`}
          variant="elevated">
          {isPrimary ? (
            <>
              <View style={[styles.headingRow, usesStackedLayout && styles.stackedHeadingRow]}>
                <AppText style={styles.title} variant="title">
                  {suggestion.title}
                </AppText>
                {suggestion.emphasis ? (
                <Pill label={suggestion.emphasis} tone="accent-filled" />
                ) : null}
              </View>
              <View style={styles.pieceList}>
                {suggestion.pieces.map((piece, index) => (
                  <Fragment key={`${piece.slot}-${piece.item}`}>
                    {index > 0 ? (
                      <Divider
                        testID={`outfit-card-${suggestion.id}-divider`}
                        variant="inset"
                      />
                    ) : null}
                    <View
                      style={styles.pieceRow}
                      testID={`outfit-card-${suggestion.id}-piece`}>
                      <GarmentSlotTile
                        category={piece.category}
                        color={theme.colors.iconPrimary}
                        size={28}
                      />
                      <AppText style={styles.itemLabel}>{piece.item}</AppText>
                      <AppText
                        colorRole="textSecondary"
                        style={styles.slotLabel}
                        variant="caption">
                        {piece.slot}
                      </AppText>
                    </View>
                  </Fragment>
                ))}
              </View>
              {suggestion.reasons.length > 0 ? (
                <View
                  style={[styles.reason, { backgroundColor: theme.colors.surfaceMuted }]}
                  testID={`outfit-card-${suggestion.id}-reason`}>
                  <Icon color={theme.colors.iconSecondary} name="info" size={16} />
                  <AppText colorRole="textSecondary" style={styles.reasonText} variant="caption">
                    {suggestion.reasons.join(' ')}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.chevronRow}>
                <Icon color={theme.colors.iconSecondary} name="chevronRight" size={16} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.glyphRow}>
                {suggestion.pieces.map((piece) => (
                  <GarmentSlotGlyph
                    category={piece.category}
                    color={theme.colors.iconSecondary}
                    key={`${piece.slot}-${piece.item}`}
                    size={18}
                  />
                ))}
              </View>
              <AppText style={styles.title} variant="bodyStrong">
                {suggestion.title}
              </AppText>
              <AppText colorRole="textSecondary" variant="caption">
                {suggestion.pieceCountLabel}
              </AppText>
            </>
          )}
        </Surface>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  primaryCard: {
    padding: spacing.xl,
  },
  secondaryCard: {
    flex: 1,
    padding: spacing.lg,
  },
  secondaryPressable: {
    flex: 1,
  },
  stackedSecondaryPressable: {
    flex: 0,
    width: '100%',
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
  pieceList: {
    gap: spacing.sm,
  },
  pieceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 28,
  },
  itemLabel: {
    flex: 1,
    flexShrink: 1,
  },
  slotLabel: {
    flexShrink: 1,
    textAlign: 'right',
  },
  reason: {
    alignItems: 'flex-start',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  reasonText: {
    flex: 1,
    flexShrink: 1,
  },
  chevronRow: {
    alignItems: 'flex-end',
  },
  glyphRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
