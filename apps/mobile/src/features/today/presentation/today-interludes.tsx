import { use } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Entrance, Surface } from '@/components/ui';
import { GarmentBoardSkeleton } from '@/features/today/presentation/garment-board-skeleton';
import { HandoffHoldContext, PhaseMark } from '@/features/today/presentation/today-motion';
import { STAGE_RADIUS } from '@/features/today/presentation/today-outfit';
import { spacing } from '@/theme/theme';
import { OnPlate } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** The first wait's content: what is being prepared, its placeholder stage and its status. */
export function TodayLoadingContent({
  body,
  contentWidth,
  showsPhaseMark,
  status,
  title,
}: Readonly<{
  body: string;
  contentWidth: number;
  showsPhaseMark: boolean;
  status: string;
  title: string;
}>) {
  const theme = useKuyaraTheme();
  return (
    <>
      {/* The wait says what is being prepared. Without it the first run is a breathing
          placeholder and one status line, and the mapper's own title and body had no
          reader on this screen. */}
      <View style={styles.loadingIntro} testID="today-loading-intro">
        <AppText accessibilityRole="header" variant="title">
          {title}
        </AppText>
        <AppText colorRole="textSecondary">{body}</AppText>
      </View>
      {/* The plate takes its height from the placeholders it holds, the way the
          loaded stage takes its own from the drawn pieces. */}
      <View
        style={[styles.stage, { backgroundColor: theme.colors.stage }]}
        testID="today-skeleton-stage">
        <OnPlate color={theme.colors.stage}>
          <GarmentBoardSkeleton testID="today-skeleton-board" width={contentWidth} />
        </OnPlate>
      </View>
      {/* Law 7: the breathing placeholders and the breathing mark are never the only
          signal. This line is the state, and it is what a screen reader is given. */}
      <View style={styles.generatingStatus} testID="today-generating-status-row">
        {showsPhaseMark ? <PhaseMark size={20} testID="today-generating-mark" /> : null}
        <AppText
          accessibilityLiveRegion="polite"
          colorRole="textSecondary"
          style={styles.generatingStatusText}
          testID="today-generating-status">
          {status}
        </AppText>
      </View>
    </>
  );
}

/** Today's card when there is nothing to dress for: no place, or a failure. */
export function TodayFeedbackCard({
  accessibilityLabel,
  actionLabel,
  body,
  noActiveLocation,
  onAction,
  title,
}: Readonly<{
  accessibilityLabel: string;
  actionLabel: string | undefined;
  body: string;
  noActiveLocation: boolean;
  onAction: () => void;
  title: string;
}>) {
  return (
    // The card arrives the way the loaded outfit does, once, and waits behind a runway
    // that is still fading out over it.
    <Entrance style={styles.feedbackEntrance} waiting={use(HandoffHoldContext)}>
    <Surface
      style={styles.feedbackCard}
      testID={
        noActiveLocation
          ? 'today-no-location'
          : 'today-unavailable-screen'
      }
      variant="elevated">
      {/* The text reads as one alert and the action beside it stays its own element: on
          iOS an accessible view hides everything inside it from VoiceOver. */}
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="alert"
        style={styles.feedbackText}>
        <AppText accessibilityRole="header" variant="title" style={styles.centerText}>
          {title}
        </AppText>
        <AppText colorRole="textSecondary" style={styles.centerText}>
          {body}
        </AppText>
      </View>
      {actionLabel ? (
        <Button
          label={actionLabel}
          onPress={onAction}
        />
      ) : null}
    </Surface>
    </Entrance>
  );
}

/** The loaded screen's quiet card when no outfit could be composed for the day. */
export function TodayNoOutfit({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <Entrance index={1}>
    <Surface
      accessible
      accessibilityLabel={`${title}. ${body}`}
      accessibilityRole="alert"
      style={[styles.feedbackCard, styles.noOutfit]}
      variant="muted">
      <AppText accessibilityRole="header" style={styles.centerText} variant="title">
        {title}
      </AppText>
      <AppText colorRole="textSecondary" style={styles.centerText}>
        {body}
      </AppText>
    </Surface>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: STAGE_RADIUS, overflow: 'hidden' },
  loadingIntro: { gap: spacing.xs, marginBottom: spacing.md },
  generatingStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  generatingStatusText: { flexShrink: 1 },
  noOutfit: { marginTop: spacing.md },
  feedbackEntrance: { alignItems: 'center', width: '100%' },
  feedbackCard: { alignItems: 'center', gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%' },
  // The card's own centring and gap, carried inside the grouped text so nothing moves.
  feedbackText: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.md },
  centerText: { textAlign: 'center' },
});
