import { StyleSheet, View } from 'react-native';

import { AppText, Button, GarmentSlotGlyph, Icon, Pill, Screen, Surface } from '@/components/ui';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import type { TodayScreenState } from '@/features/today/model';
import type { GarmentOwnershipState } from '@/features/wardrobe/domain/garment-type-ownership';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const CARD_BACKGROUND_ALPHA = 0.08;

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  onBack: () => void;
  backLabel: string;
  ownershipByGarmentType: Readonly<Record<string, GarmentOwnershipState>>;
  onSetOwnership: (garmentTypeId: GarmentTypeId, next: 'owned' | 'wanted') => void;
}>;

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  onBack,
  backLabel,
  ownershipByGarmentType,
  onSetOwnership,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const copy = getMessages(language).today;
  const presentation = createTodayPresentation(state, language);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;

  if (presentation.kind !== 'loaded' || !suggestion) {
    return (
      <Screen testID="outfit-detail-screen">
        <Button label={backLabel} onPress={onBack} variant="quiet" />
        <AppText accessibilityRole="header" variant="titleLarge">
          {presentation.kind === 'loaded' ? presentation.copy.title : presentation.title}
        </AppText>
      </Screen>
    );
  }

  const ownedCount = suggestion.pieces.filter(
    ({ garmentTypeId }) => ownershipByGarmentType[garmentTypeId] === 'owned',
  ).length;

  return (
    <Screen testID="outfit-detail-screen">
      <Button label={backLabel} onPress={onBack} style={styles.backButton} variant="quiet" />

      <View style={styles.headingGroup}>
        <AppText accessibilityRole="header" variant="titleLarge">
          {suggestion.title}
        </AppText>
        {suggestion.emphasis ? <Pill label={suggestion.emphasis} tone="accent-filled" /> : null}
      </View>

      <View
        style={[styles.ownershipSummary, { backgroundColor: theme.colors.surfaceMuted }]}
        testID="outfit-detail-ownership-summary">
        <Icon color={theme.colors.brandAccent} name="info" size={16} />
        <AppText colorRole="textSecondary" style={styles.ownershipSummaryText} variant="caption">
          {copy.ownershipSummary({ owned: ownedCount, total: suggestion.pieces.length })}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
          {presentation.copy.piecesHeading}
        </AppText>
        <View style={styles.pieceList}>
          {suggestion.pieces.map(({ category, garmentTypeId, slot, item }) => {
            const owned = ownershipByGarmentType[garmentTypeId] === 'owned';
            const wanted = ownershipByGarmentType[garmentTypeId] === 'wanted';

            return (
              <Surface
                key={`${slot}-${item}`}
                style={[styles.pieceCard, { backgroundColor: theme.colors.surface }]}
                testID="outfit-detail-piece-card"
                variant="elevated">
                <GarmentSlotGlyph
                  category={category}
                  color={theme.colors.iconSecondary}
                  size={22}
                />
                <View style={styles.pieceContent}>
                  <View>
                    <AppText style={styles.itemLabel} variant="bodyStrong">
                      {item}
                    </AppText>
                    <AppText colorRole="textSecondary" variant="caption">
                      {slot}
                    </AppText>
                  </View>
                  <View style={styles.ownershipActions}>
                    <Button
                      accessibilityState={{ selected: owned }}
                      label={copy.ownershipOwnedAction}
                      onPress={owned ? undefined : () => onSetOwnership(garmentTypeId, 'owned')}
                      style={styles.ownershipAction}
                      testID={`outfit-detail-ownership-${garmentTypeId}-owned`}
                      variant={owned ? 'primary' : 'secondary'}
                    />
                    <Button
                      accessibilityState={{ selected: wanted }}
                      label={copy.ownershipWantedAction}
                      onPress={wanted ? undefined : () => onSetOwnership(garmentTypeId, 'wanted')}
                      style={styles.ownershipAction}
                      testID={`outfit-detail-ownership-${garmentTypeId}-wanted`}
                      variant={wanted ? 'primary' : 'secondary'}
                    />
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>
      </View>

      {suggestion.reasons.length > 0 ? (
        <View style={styles.section}>
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.reasonsHeading}
          </AppText>
          <View style={styles.reasonList}>
            {suggestion.reasons.map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.reasonMarker, { backgroundColor: theme.colors.brandAccent }]}
                />
                <AppText colorRole="textSecondary" style={styles.reasonText} variant="body">
                  {reason}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.weatherRecap,
          { backgroundColor: withAlpha(theme.colors.brandAccent, CARD_BACKGROUND_ALPHA) },
        ]}>
        <AppText tabularNumbers variant="caption">
          {`${presentation.weather.temperature} · ${presentation.weather.condition} · ${presentation.weather.rainProbability}`}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
  },
  headingGroup: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ownershipSummary: {
    alignItems: 'flex-start',
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  ownershipSummaryText: {
    flex: 1,
    flexShrink: 1,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  pieceList: {
    gap: spacing.md,
  },
  pieceCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  pieceContent: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.sm,
  },
  itemLabel: {
    flex: 1,
    flexShrink: 1,
  },
  ownershipActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ownershipAction: {
    flex: 1,
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
  weatherRecap: {
    borderRadius: radii.card,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
});
