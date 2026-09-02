import { useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { AppText, Icon, IconButton, Pill, Screen, Surface, StretchyHeader } from '@/components/ui';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitSuggestionCard } from '@/features/today/presentation/outfit-suggestion-card';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import type { SupportedLanguage } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  onOpenSettings: () => void;
  onOpenOutfitDetail: (id: string) => void;
  onRefresh: () => void;
}>;

export function TodayScreen({
  state,
  language,
  onOpenSettings,
  onOpenOutfitDetail,
  onRefresh,
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
        <View style={styles.titleRow}>
          <Icon name="location" color={theme.colors.iconSecondary} size={16} />
          <AppText
            accessibilityLabel={presentation.copy.headerAccessibilityLabel({
              title: presentation.copy.title,
              location: presentation.header.location,
            })}
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.location}
            variant="title">
            {presentation.header.location}
          </AppText>
          <View style={styles.headerActions}>
            <IconButton
              accessibilityLabel={presentation.copy.refreshAction}
              hitSlop={7}
              icon={(color) => <Icon color={color} name="refresh" size={18} />}
              onPress={onRefresh}
              style={[styles.settingsButton, { backgroundColor: withAlpha(theme.colors.textPrimary, 0.1) }]}
              testID="today-refresh-button"
            />
            <IconButton
              accessibilityHint={presentation.copy.settingsHint}
              accessibilityLabel={presentation.copy.settingsAction}
              hitSlop={7}
              icon={(color) => <Icon color={color} name="settings" size={18} />}
              onPress={onOpenSettings}
              style={[styles.settingsButton, { backgroundColor: withAlpha(theme.colors.textPrimary, 0.1) }]}
              testID="today-settings-button"
            />
          </View>
        </View>
        <View
          accessible
          accessibilityLabel={presentation.weather.accessibilityLabel}
          style={[styles.heroRow, usesAccessibilityLayout && styles.stackedHeroRow]}>
          <AppText testID="today-header-temperature" variant="display">
            {presentation.weather.temperature}
          </AppText>
          <View style={styles.heroCopy}>
            <AppText>{presentation.weather.condition}</AppText>
            <AppText colorRole="textSecondary" variant="caption">
              {`${presentation.weather.range} · ${presentation.weather.apparentTemperature}`}
            </AppText>
          </View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.weatherGlyph}>
            <WeatherGlyph testID="today-header-weather-glyph" />
          </View>
        </View>
        <View style={styles.freshnessRow}>
          <Icon name="clock" color={theme.colors.iconSecondary} size={13} />
          <AppText
            accessibilityLiveRegion={presentation.header.announceFreshness ? 'polite' : 'none'}
            colorRole="textSecondary"
            style={styles.freshnessText}
            variant="caption">
            {presentation.header.freshness}
          </AppText>
        </View>
      </StretchyHeader>

      <Screen
        alwaysBounceVertical
        contentContainerStyle={styles.content}
        contentTopClearance={headerHeight + spacing['2xl']}
        onScroll={scrollHandler}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.iconSecondary]}
            onRefresh={onRefresh}
            progressViewOffset={headerHeight}
            refreshing={presentation.header.isRefreshing}
            tintColor={theme.colors.iconSecondary}
          />
        }
        testID="today-screen">
        {primarySuggestion ? (
          <View style={styles.section}>
            <View style={[styles.contextRow, usesAccessibilityLayout && styles.stackedContextRow]}>
              <AppText
                accessibilityRole="header"
                colorRole="textPrimary"
                style={styles.contextHeading}
                variant="bodyStrong">
                {presentation.copy.recommendedTodayHeading}
              </AppText>
              {presentation.generationMode ? (
                <View
                  accessible
                  accessibilityLabel={presentation.generationMode.accessibilityLabel}
                  style={usesAccessibilityLayout ? styles.stackedGenerationMode : undefined}>
                  <Pill
                    icon={(color) => <Icon color={color} name="sparkle" size={12} />}
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

        {otherSuggestions.length > 0 ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.otherOptionsHeading}
            </AppText>
            <View
              style={[styles.outfitList, usesAccessibilityLayout && styles.stackedOutfitList]}
              testID="today-outfit-list">
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
    gap: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  header: {
    gap: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  location: {
    flex: 1,
    flexShrink: 1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  stackedContextRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  contextHeading: {
    flex: 1,
    flexShrink: 1,
  },
  stackedGenerationMode: {
    alignSelf: 'flex-start',
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stackedHeroRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
  weatherGlyph: {
    marginStart: 'auto',
  },
  freshnessRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  freshnessText: {
    flex: 1,
    flexShrink: 1,
  },
  section: {
    gap: spacing.lg,
  },
  outfitList: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  stackedOutfitList: {
    flexDirection: 'column',
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
