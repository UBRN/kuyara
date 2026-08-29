import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { AppText, IconButton, Pill, Screen, Surface, StretchyHeader } from '@/components/ui';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitSuggestionCard } from '@/features/today/presentation/outfit-suggestion-card';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { WeatherCard } from '@/features/today/presentation/weather-card';
import type { SupportedLanguage } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  onOpenSettings: () => void;
  onOpenOutfitDetail: (id: string) => void;
}>;

export function TodayScreen({
  state,
  language,
  onOpenSettings,
  onOpenOutfitDetail,
}: TodayScreenProps) {
  const presentation = createTodayPresentation(state, language);
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesAccessibilityLayout = fontScale > 1.5;
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollOffset = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.y);
  });

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

  const [primarySuggestion, ...otherSuggestions] = presentation.suggestions;

  return (
    <View style={[styles.loadedScreen, { backgroundColor: theme.colors.background }]}>
      <StretchyHeader
        contentContainerStyle={styles.header}
        onHeightChange={setHeaderHeight}
        scrollOffset={scrollOffset}
        testID="today-stretchy-header">
        <View style={[styles.titleRow, usesAccessibilityLayout && styles.stackedContextRow]}>
          <View>
            <AppText
              accessibilityLabel={presentation.copy.headerAccessibilityLabel({
                title: presentation.copy.title,
                location: presentation.header.location,
              })}
              accessibilityRole="header"
              variant="bodyStrong">
              {presentation.header.location}
            </AppText>
            <AppText colorRole="textSecondary" variant="caption">
              {presentation.header.date}
            </AppText>
          </View>
          <IconButton
            accessibilityHint={presentation.copy.settingsHint}
            accessibilityLabel={presentation.copy.settingsAction}
            hitSlop={7}
            icon={(color) => (
              <SymbolView
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
                size={18}
                tintColor={color}
              />
            )}
            onPress={onOpenSettings}
            style={[styles.settingsButton, { backgroundColor: withAlpha(theme.colors.textPrimary, 0.1) }]}
            testID="today-settings-button"
          />
        </View>
        <AppText
          accessibilityLiveRegion={presentation.header.isStale ? 'polite' : 'none'}
          colorRole="textSecondary"
          variant="caption">
          {presentation.header.freshness}
        </AppText>
      </StretchyHeader>

      <Screen
        alwaysBounceVertical
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + spacing['2xl'] },
        ]}
        onScroll={scrollHandler}
        testID="today-screen">
        {primarySuggestion ? (
          <View style={styles.section}>
            <View style={styles.contextRow}>
              <AppText colorRole="brandAccent" variant="eyebrow">
                {presentation.copy.recommendedTodayHeading}
              </AppText>
              {presentation.generationMode ? (
                <View
                  accessible
                  accessibilityLabel={presentation.generationMode.accessibilityLabel}>
                  <Pill
                    label={presentation.generationMode.label}
                    testID="today-generation-mode"
                    tone={presentation.generationMode.tone}
                  />
                </View>
              ) : null}
            </View>
            <OutfitSuggestionCard
              onPress={() => onOpenOutfitDetail(primarySuggestion.id)}
              suggestion={primarySuggestion}
              variant="primary"
            />
          </View>
        ) : null}

        {presentation.noOutfit ? (
          <Surface
            accessible
            accessibilityLabel={`${presentation.noOutfit.title}. ${presentation.noOutfit.body}`}
            accessibilityRole="alert"
            style={styles.feedbackCard}
            variant="muted">
            <AppText accessibilityRole="header" style={styles.centerText} variant="title">
              {presentation.noOutfit.title}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centerText}>
              {presentation.noOutfit.body}
            </AppText>
          </Surface>
        ) : null}

        <WeatherCard
          accessibilityLabel={presentation.weather.accessibilityLabel}
          apparentTemperature={presentation.weather.apparentTemperature}
          condition={presentation.weather.condition}
          rainProbability={presentation.weather.rainProbability}
          rainTimeline={presentation.weather.hourlyRainProbability.length > 0
            ? {
                accessibilityLabel: presentation.weather.rainTimelineAccessibilityLabel,
                heading: presentation.copy.rainOutlookHeading,
                hours: presentation.weather.hourlyRainProbability,
              }
            : undefined}
          range={presentation.weather.range}
          metricsAccessibilityLabel={presentation.weather.metricsAccessibilityLabel}
          stats={[
            { label: presentation.copy.windLabel, value: presentation.weather.wind },
            { label: presentation.copy.humidityLabel, value: presentation.weather.humidity },
            { label: presentation.copy.uvIndexLabel, value: presentation.weather.uvIndex },
          ]}
          temperature={presentation.weather.temperature}
          testID="today-weather-card"
        />

        {otherSuggestions.length > 0 ? (
          <View style={styles.section}>
            <AppText colorRole="brandAccent" variant="eyebrow">
              {presentation.copy.otherOptionsHeading}
            </AppText>
            <View style={styles.outfitList} testID="today-outfit-list">
              {otherSuggestions.map((suggestion) => (
                <OutfitSuggestionCard
                  key={suggestion.id}
                  onPress={() => onOpenOutfitDetail(suggestion.id)}
                  suggestion={suggestion}
                  variant="secondary"
                />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  loadedScreen: {
    flex: 1,
  },
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  header: {
    gap: spacing.xs,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  settingsButton: {
    borderRadius: 15,
    borderWidth: 0,
    height: 30,
    minHeight: 0,
    width: 30,
  },
  contextRow: {
    alignItems: 'center',
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
    gap: spacing.md,
  },
  outfitList: {
    gap: spacing.md,
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
