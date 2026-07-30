import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, IconButton, Screen, SectionHeader, Surface } from '@/components/ui';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitSuggestionCard } from '@/features/today/presentation/outfit-suggestion-card';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { WeatherSummary } from '@/features/today/presentation/weather-summary';
import type { SupportedLanguage } from '@/localization/messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  onOpenSettings: () => void;
}>;

export function TodayScreen({ state, language, onOpenSettings }: TodayScreenProps) {
  const presentation = createTodayPresentation(state, language);
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesAccessibilityLayout = fontScale > 1.5;

  if (presentation.kind !== 'loaded') {
    return (
      <Screen
        accessibilityLabel={presentation.accessibilityLabel}
        contentContainerStyle={styles.feedbackContent}
        testID={`today-${presentation.kind}-screen`}>
        <Surface
          accessibilityRole={presentation.kind === 'unavailable' ? 'alert' : undefined}
          style={styles.feedbackCard}
          variant="elevated">
          {presentation.kind === 'loading' ? (
            <ActivityIndicator
              accessibilityLabel={presentation.accessibilityLabel}
              color={theme.colors.iconSecondary}
              size="large"
            />
          ) : null}
          <AppText accessibilityRole="header" variant="title" style={styles.centerText}>
            {presentation.title}
          </AppText>
          <AppText colorRole="textSecondary" style={styles.centerText}>
            {presentation.body}
          </AppText>
        </Surface>
      </Screen>
    );
  }

  return (
    <Screen testID="today-screen" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText
            accessibilityRole="header"
            style={styles.title}
            variant={usesAccessibilityLayout ? 'titleLarge' : 'display'}>
            {presentation.copy.title}
          </AppText>
          <IconButton
            accessibilityHint={presentation.copy.settingsHint}
            accessibilityLabel={presentation.copy.settingsAction}
            icon={(color) => (
              <SymbolView
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
                size={22}
                tintColor={color}
              />
            )}
            onPress={onOpenSettings}
            testID="today-settings-button"
          />
        </View>
        <View
          style={[
            styles.contextRow,
            usesAccessibilityLayout && styles.stackedContextRow,
          ]}>
          <AppText variant="bodyStrong">{presentation.header.location}</AppText>
          <AppText colorRole="textSecondary">{presentation.header.date}</AppText>
        </View>
        <AppText
          accessibilityLiveRegion={presentation.header.isStale ? 'polite' : 'none'}
          colorRole="textSecondary"
          variant="caption">
          {presentation.header.freshness}
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title={presentation.copy.weatherHeading} />
        <WeatherSummary weather={presentation.weather} />
      </View>

      <View style={styles.section}>
        <SectionHeader title={presentation.copy.guidanceHeading} />
        <Surface variant="interactive" style={styles.guidanceCard} testID="today-guidance">
          <AppText variant="bodyStrong">{presentation.guidance}</AppText>
        </Surface>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={presentation.copy.outfitsHeading}
          supportingText={presentation.copy.outfitsSupportingText}
        />
        <View style={styles.outfitList} testID="today-outfit-list">
          {presentation.suggestions.map((suggestion) => (
            <OutfitSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              piecesHeading={presentation.copy.piecesHeading}
              reasonsHeading={presentation.copy.reasonsHeading}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    flexShrink: 1,
  },
  contextRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  stackedContextRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  section: {
    gap: spacing.lg,
  },
  guidanceCard: {
    padding: spacing.xl,
  },
  outfitList: {
    gap: spacing.lg,
  },
  feedbackContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  feedbackCard: {
    alignItems: 'center',
    gap: spacing.lg,
    maxWidth: 520,
    padding: spacing.xl,
    width: '100%',
  },
  centerText: {
    textAlign: 'center',
  },
});
