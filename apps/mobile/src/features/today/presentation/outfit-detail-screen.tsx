import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Pill, Screen } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import type { TodayScreenState } from '@/features/today/model';
import { CARD_BACKGROUND_ALPHA } from '@/features/today/presentation/weather-card';
import type { SupportedLanguage } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  onBack: () => void;
  backLabel: string;
}>;

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  onBack,
  backLabel,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
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

  return (
    <Screen testID="outfit-detail-screen">
      <Button label={backLabel} onPress={onBack} style={styles.backButton} variant="quiet" />

      <View style={styles.headingGroup}>
        <AppText accessibilityRole="header" variant="titleLarge">
          {suggestion.title}
        </AppText>
        {suggestion.emphasis ? <Pill label={suggestion.emphasis} tone="accent-filled" /> : null}
      </View>

      <View style={styles.section}>
        <AppText colorRole="brandAccent" variant="eyebrow">
          {presentation.copy.piecesHeading}
        </AppText>
        <View style={styles.pieceList}>
          {suggestion.pieces.map(({ slot, item }, index) => (
            <Fragment key={`${slot}-${item}`}>
              {index > 0 ? <Divider testID="outfit-piece-divider" variant="inset" /> : null}
              <View style={styles.pieceRow}>
                <AppText colorRole="textSecondary" style={styles.slotLabel}>
                  {slot}
                </AppText>
                <AppText style={styles.itemLabel} variant="bodyStrong">
                  {item}
                </AppText>
              </View>
            </Fragment>
          ))}
        </View>
      </View>

      {suggestion.reasons.length > 0 ? (
        <View style={styles.section}>
          <AppText colorRole="brandAccent" variant="eyebrow">
            {presentation.copy.reasonsHeading}
          </AppText>
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
      ) : null}

      <View
        style={[
          styles.weatherRecap,
          { backgroundColor: withAlpha(theme.colors.brandAccent, CARD_BACKGROUND_ALPHA) },
        ]}>
        <AppText variant="caption">
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
    marginTop: spacing.lg,
  },
  section: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  pieceList: {
    gap: spacing.sm,
  },
  pieceRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  slotLabel: {
    flexBasis: 76,
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
  weatherRecap: {
    borderRadius: radii.card,
    marginTop: spacing['2xl'],
    padding: spacing.lg,
  },
});
