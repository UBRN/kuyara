import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import type { LoadedOutfitPresentation } from '@/features/today/presentation/today-presentation';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type OutfitSuggestionCardProps = Readonly<{
  suggestion: LoadedOutfitPresentation;
  piecesHeading: string;
  reasonsHeading: string;
}>;

export function OutfitSuggestionCard({
  suggestion,
  piecesHeading,
  reasonsHeading,
}: OutfitSuggestionCardProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;

  return (
    <Surface
      accessible
      accessibilityLabel={suggestion.accessibilityLabel}
      testID={`outfit-card-${suggestion.id}`}
      style={[
        styles.card,
        suggestion.emphasis && { borderColor: theme.colors.borderStrong },
      ]}>
      <View style={styles.headingGroup}>
        <View style={[styles.eyebrowRow, usesStackedLayout && styles.stackedEyebrowRow]}>
          <AppText variant="caption" colorRole="textSecondary">
            {suggestion.positionLabel}
          </AppText>
          {suggestion.emphasis ? (
            <Surface variant="interactive" style={styles.badge}>
              <AppText variant="caption" colorRole="brandAccent">
                {suggestion.emphasis}
              </AppText>
            </Surface>
          ) : null}
        </View>
        <AppText variant="title">{suggestion.title}</AppText>
        <AppText colorRole="textSecondary">{suggestion.description}</AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="label">{piecesHeading}</AppText>
        <View style={styles.pieceList}>
          {suggestion.pieces.map(({ item, slot }) => (
            <View
              key={`${slot}-${item}`}
              style={[styles.pieceRow, usesStackedLayout && styles.stackedPieceRow]}>
              <AppText variant="caption" colorRole="textSecondary" style={styles.slotLabel}>
                {slot}
              </AppText>
              <AppText variant="bodyStrong" style={styles.itemLabel}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label">{reasonsHeading}</AppText>
        <View style={styles.reasonList}>
          {suggestion.reasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[styles.reasonMarker, { backgroundColor: theme.colors.brandAccent }]}
              />
              <AppText colorRole="textSecondary" style={styles.reasonText}>
                {reason}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl,
    padding: spacing.xl,
  },
  headingGroup: {
    gap: spacing.sm,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  stackedEyebrowRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  pieceList: {
    gap: spacing.sm,
  },
  pieceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stackedPieceRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  slotLabel: {
    flexBasis: 88,
    flexGrow: 0,
    flexShrink: 0,
  },
  itemLabel: {
    flex: 1,
    flexShrink: 1,
  },
  reasonList: {
    gap: spacing.sm,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonMarker: {
    borderRadius: radii.pill,
    height: 6,
    marginTop: 9,
    width: 6,
  },
  reasonText: {
    flex: 1,
    flexShrink: 1,
  },
});
