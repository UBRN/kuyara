import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  AppText,
  Button,
  Entrance,
  GarmentBoard,
  haptics,
  Icon,
  PressScale,
  measureGarmentBoardHeight,
  Screen,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import type { TodayScreenState } from '@/features/today/model';
import {
  createTodayPresentation,
  type LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { spacing, type AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  onOpenOutfitDetail: (id: string) => void;
  onRefresh: () => void;
}>;

export function TodayScreen({ state, language, onOpenOutfitDetail, onRefresh }: TodayScreenProps) {
  const router = useRouter();
  const weatherApplication = useWeatherApplication();
  const { hour12 } = useLocalization();
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));
  const presentationState =
    state.kind === 'unavailable' &&
    weatherApplication.state.status === 'ready' &&
    weatherApplication.state.activeLocation === null
      ? { ...state, reason: 'no-active-location' as const }
      : state;
  const presentation = createTodayPresentation(presentationState, language, hour12, now);
  const copy = getMessages(language).today;
  const theme = useKuyaraTheme();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { fontScale, usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // Measure the content after Screen applies its safe-area insets and width cap.
  const [contentWidth, setContentWidth] = useState(0);
  useRefreshOutcomeHaptics(
    presentation.kind === 'loaded' && presentation.header.isRefreshing,
    state.kind === 'loaded' && state.refreshFailed,
  );

  if (presentation.kind !== 'loaded') {
    return (
      <Screen
        accessibilityLabel={presentation.accessibilityLabel}
        contentContainerStyle={styles.feedbackContent}
        fill
        testID="today-screen">
        <Surface
          accessible
          accessibilityLabel={presentation.accessibilityLabel}
          accessibilityRole={presentation.kind === 'unavailable' ? 'alert' : undefined}
          style={styles.feedbackCard}
          testID={
            presentation.kind === 'unavailable' && presentation.reason === 'no-active-location'
              ? 'today-no-location'
              : `today-${presentation.kind}-screen`
          }
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
          {presentation.kind === 'unavailable' && presentation.actionLabel ? (
            <Button label={presentation.actionLabel} onPress={() => router.push('/weather/location')} />
          ) : null}
        </Surface>
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];
  // The glyph draws the same rain at every tempo; only the condition's ambient step says
  // how fast it falls.
  const ambientIntensity = state.kind === 'loaded'
    ? ambientIntensityOf(state.snapshot.weather.current.condition)
    : 'calm';
  const [primary, ...alternates] = presentation.suggestions;
  const alternateWidth = usesAccessibilityLayout
    ? contentWidth
    : Math.max(0, (contentWidth - spacing.lg) / 2);
  // Each board's stage height is derived from its own pieces, so two alternates side by
  // side would end at different heights and their captions would sit on different
  // baselines. The alternates share the taller stage and centre their board in it.
  const alternateStageHeight = Math.max(
    0,
    ...alternates.map((suggestion) =>
      measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today'),
    ),
  );

  return (
    <Screen
      // The visible refresh gesture cannot be performed by a screen reader. The custom
      // action gives VoiceOver and TalkBack the same refresh without adding a visible
      // control; the haptic belongs to the gesture, so it stays with the gesture.
      accessibilityActions={[{ name: 'refresh', label: copy.refreshAction }]}
      alwaysBounceVertical
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'refresh') onRefresh();
      }}
      refreshControl={
        <RefreshControl
          colors={[theme.colors.iconSecondary]}
          onRefresh={() => {
            haptics.impactLight();
            onRefresh();
          }}
          refreshing={presentation.header.isRefreshing}
          tintColor={theme.colors.iconSecondary}
        />
      }
      testID="today-screen">
      <View onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)} testID="today-content">
        <View style={styles.placeRow}>
          <Icon name="location" color={theme.colors.iconSecondary} size={13} />
          <AppText colorRole="textSecondary" numberOfLines={1} style={styles.location} variant="caption">
            {presentation.header.location}
          </AppText>
        </View>

        {primary ? (
          <>
            <Pressable
              accessible
              accessibilityLabel={presentation.stageAccessibilityLabel}
              accessibilityRole="button"
              onPress={() => onOpenOutfitDetail(primary.id)}
              style={({ pressed }) => ({ opacity: pressed ? theme.interaction.pressedOpacity : 1 })}>
              {usesAccessibilityLayout ? <Sky intensity={ambientIntensity} weather={presentation.weather} /> : null}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.stage,
                  {
                    backgroundColor: stageColor,
                    width: contentWidth,
                    height: measureGarmentBoardHeight(primary.boardPieces, contentWidth, 'today'),
                  },
                ]}
                testID="today-stage">
                <GarmentBoard
                  accessibilityLabel={presentation.stageAccessibilityLabel}
                  pieces={primary.boardPieces}
                  preset="today"
                  rise
                  stageColor={stageColor}
                  testID="today-primary-board"
                  width={contentWidth}
                />
                {!usesAccessibilityLayout ? <Sky intensity={ambientIntensity} overlay weather={presentation.weather} /> : null}
              </View>
              <View style={styles.titleRow}>
                <AppText style={styles.outfitName} testID="today-archetype" variant="title">
                  {primary.title}
                </AppText>
                <View style={styles.disclosure}>
                  <Icon color={theme.colors.textPrimary} name="chevronRight" size={20} />
                </View>
              </View>
            </Pressable>
            <AppText
              colorRole="textSecondary"
              style={[styles.rationale, { maxWidth: theme.typography.body.fontSize * fontScale * 31 * 0.5 }]}
              testID="today-rationale">
              {primary.reasons[0]}
            </AppText>
          </>
        ) : (
          <View accessible accessibilityLabel={presentation.weather.accessibilityLabel}>
            <Sky intensity={ambientIntensity} weather={presentation.weather} />
          </View>
        )}

        <View style={styles.provenance} testID="today-provenance">
          {presentation.generationMode ? (
            <>
              <View testID="today-provenance-sparkle">
                <Icon color={theme.colors.brandAccent} name="sparkle" size={12} />
              </View>
              <AppText
                accessibilityLabel={presentation.generationMode.accessibilityLabel}
                colorRole="textSecondary"
                testID="today-generation-mode"
                variant="caption">
                {presentation.generationMode.label}
              </AppText>
              <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" colorRole="textSecondary" variant="caption">·</AppText>
            </>
          ) : null}
          <AppText
            accessibilityLiveRegion={presentation.header.announceFreshness ? 'polite' : 'none'}
            colorRole="textSecondary"
            style={styles.freshness}
            tabularNumbers
            testID="today-freshness"
            variant="caption">
            {presentation.header.freshness}
          </AppText>
        </View>

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

        {alternates.length > 0 ? (
          <View style={styles.alternates}>
            <View
              style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}
              testID="today-alternates-heading">
              <AppText accessibilityRole="header" colorRole="textSecondary" variant="bodyStrong">
                {presentation.copy.otherOptionsHeading}
              </AppText>
            </View>
            <View
              style={[styles.outfitList, usesAccessibilityLayout && styles.stackedOutfitList]}
              testID="today-outfit-list">
              {alternates.map((suggestion, index) => (
                <Entrance index={index + 1} key={suggestion.id}>
                  <PressScale
                    accessible
                    accessibilityLabel={suggestion.boardAccessibilityLabel}
                    accessibilityRole="button"
                    onPress={() => onOpenOutfitDetail(suggestion.id)}
                    style={({ pressed }) => [
                      { width: alternateWidth, opacity: pressed ? theme.interaction.pressedOpacity : 1 },
                    ]}
                    testID={`today-alternate-${suggestion.id}`}>
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[
                        styles.alternateStage,
                        { backgroundColor: stageColor, height: alternateStageHeight },
                      ]}
                      testID={`today-alternate-stage-${suggestion.id}`}>
                      <GarmentBoard
                        accessibilityLabel={suggestion.boardAccessibilityLabel}
                        pieces={suggestion.boardPieces}
                        preset="today"
                        stageColor={stageColor}
                        testID={`today-alternate-board-${suggestion.id}`}
                        width={alternateWidth}
                      />
                    </View>
                    <View style={styles.alternateTitleRow}>
                      <AppText numberOfLines={1} style={styles.outfitName} variant="label">
                        {suggestion.title}
                      </AppText>
                      <View style={styles.disclosure}>
                        <Icon color={theme.colors.textPrimary} name="chevronRight" size={12} />
                      </View>
                    </View>
                  </PressScale>
                </Entrance>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function Sky({ intensity, weather, overlay = false }: Readonly<{
  intensity: AmbientIntensity;
  weather: LoadedTodayPresentation['weather'];
  overlay?: boolean;
}>) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.sky, overlay ? styles.skyOverlay : styles.skyAbove]}
      testID="today-sky">
      <View style={styles.skyText}>
        <AppText tabularNumbers testID="today-header-temperature" variant="title">
          {weather.temperature}
        </AppText>
        <AppText colorRole="textPrimary" style={styles.condition} testID="today-condition" variant="caption">
          {weather.condition}
        </AppText>
      </View>
      <View style={styles.weatherGlyph}>
        <WeatherGlyph intensity={intensity} testID="today-header-weather-glyph" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  location: { flex: 1, flexShrink: 1 },
  stage: { borderRadius: 26, overflow: 'hidden' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  outfitName: { flex: 1, flexShrink: 1 },
  disclosure: { opacity: 0.55 },
  rationale: { marginTop: spacing.sm },
  sky: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  skyText: { flex: 1, flexShrink: 1 },
  skyOverlay: { position: 'absolute', top: 18, left: 20, right: 20 },
  skyAbove: { marginBottom: spacing.md },
  condition: { marginTop: spacing.xs },
  weatherGlyph: { opacity: 0.7, transform: [{ scale: 31 / 36 }] },
  provenance: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  freshness: { flexShrink: 1 },
  alternates: { marginTop: spacing.xl },
  alternatesHeading: { paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  outfitList: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  stackedOutfitList: { flexDirection: 'column', gap: spacing.md },
  alternateStage: { borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  feedbackContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  feedbackCard: { alignItems: 'center', gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%' },
  centerText: { textAlign: 'center' },
});
