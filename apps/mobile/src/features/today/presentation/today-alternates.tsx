import { Link } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import {
  AppText,
  Entrance,
  GarmentBoard,
  Icon,
  measureGarmentBoardHeight,
  PressScale,
  Surface,
  useTextScaling,
} from '@/components/ui';
import type { OutfitDetailLink } from '@/features/today/presentation/today-outfit';
import type {
  LoadedOutfitPresentation,
  TomorrowPreviewPresentation,
} from '@/features/today/presentation/today-presentation';
import { radii, spacing } from '@/theme/theme';
import { easierToSee as easierToSeeValues, useEasierToSee, useStrongEdge } from '@/theme/easier-to-see';
import { OnPlate } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** Today's other options under the hero, each one target that opens its detail. */
export function TodayAlternates({
  alternates,
  contentWidth,
  heading,
  onOpenOutfitDetail,
  outfitDetailLink,
}: Readonly<{
  alternates: readonly LoadedOutfitPresentation[];
  contentWidth: number;
  heading: string;
  onOpenOutfitDetail: (id: string) => void;
  outfitDetailLink: OutfitDetailLink | undefined;
}>) {
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  // The one source for the strong edge (owner decision 9): the switch or iOS Increase
  // Contrast. A full-width row wears it; a two-up tile wears it on its drawing plate.
  const strongEdge = useStrongEdge();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // The two tiles share the row's own gap, so the width follows `styles.outfitList`. O13
  // (owner decision 6): while Easier to see is on, each alternate is a full-width row
  // with its drawing at the left, so a name is never cut and the list scrolls one way.
  const alternateWidth = easierToSee
    ? ALTERNATE_ROW_BOARD_WIDTH
    : usesAccessibilityLayout
      ? contentWidth
      : Math.max(0, (contentWidth - spacing.md) / 2);
  // Each board's stage height is derived from its own pieces, so two alternates side by
  // side would end at different heights and their captions would sit on different
  // baselines. The alternates share the taller stage and centre their board in it.
  const alternateStageHeight = Math.max(
    0,
    ...alternates.map((suggestion) =>
      measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today', false, easierToSee),
    ),
  );

  return (
    <View style={styles.alternates}>
      <View
        style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}
        testID="today-alternates-heading">
        <AppText accessibilityRole="header" variant="bodyStrong">
          {heading}
        </AppText>
      </View>
      <View
        style={[styles.outfitList, (usesAccessibilityLayout || easierToSee) && styles.stackedOutfitList]}
        testID="today-outfit-list">
        {alternates.map((suggestion, index) => {
          const stage = (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              // A zoom source keeps only an object style, as the link below does.
              style={StyleSheet.flatten<ViewStyle>([
                styles.alternateStage,
                { backgroundColor: theme.colors.garmentGround, height: alternateStageHeight, width: alternateWidth },
                easierToSee ? null : strongEdge,
              ])}
              testID={`today-alternate-stage-${suggestion.id}`}>
              {/* O15: each alternate stands on the page ground in its own palette, so
                  it looks the same here as on Today's stage once chosen. */}
              <OnPlate color={theme.colors.garmentGround}>
                <GarmentBoard
                  accessibilityLabel={suggestion.boardAccessibilityLabel}
                  palette={suggestion.palette}
                  pieces={suggestion.boardPieces}
                  preset="today"
                  testID={`today-alternate-board-${suggestion.id}`}
                  width={alternateWidth}
                />
              </OnPlate>
            </View>
          );
          const card = (
            <PressScale
              accessible
              accessibilityLabel={suggestion.boardAccessibilityLabel}
              onPress={outfitDetailLink ? undefined : () => onOpenOutfitDetail(suggestion.id)}
              pressedStyle={{ opacity: theme.interaction.pressedOpacity }}
              // `role` outranks the link's own, so the card still reads as a button.
              role="button"
              style={StyleSheet.flatten<ViewStyle>(
                easierToSee ? [styles.alternateRow, strongEdge] : { width: alternateWidth },
              )}
              testID={`today-alternate-${suggestion.id}`}>
              {outfitDetailLink ? <Link.AppleZoom>{stage}</Link.AppleZoom> : stage}
              <View style={[styles.alternateTitleRow, easierToSee && styles.alternateRowTitle]}>
                <AppText numberOfLines={2} style={styles.outfitName} variant="label">
                  {suggestion.title}
                </AppText>
                <Icon color={theme.colors.iconSecondary} name="chevronRight" size={16} />
              </View>
            </PressScale>
          );
          return (
            <Entrance index={index + 1} key={suggestion.id}>
              {outfitDetailLink ? (
                <Link asChild href={outfitDetailLink.href(suggestion.id)} onPress={outfitDetailLink.onPress} push>
                  {card}
                </Link>
              ) : card}
            </Entrance>
          );
        })}
      </View>
    </View>
  );
}

// B: tomorrow's strip, one button: a small drawing of the outfit, the day, its name and its
// weather in one short line, and a chevron. It sits on the muted fill the other Today rows
// use, so it reads as a way somewhere rather than as a second hero.
export function TomorrowStrip({ onPress, tomorrow }: Readonly<{ onPress: () => void; tomorrow: TomorrowPreviewPresentation }>) {
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  const strongEdge = useStrongEdge();
  const { controlScale } = useTextScaling();
  return (
    <PressScale
      accessibilityHint={tomorrow.accessibilityHint}
      accessibilityLabel={tomorrow.accessibilityLabel}
      accessibilityRole="button"
      accessible
      onPress={onPress}
      style={({ pressed }) => [styles.tomorrowTarget, { opacity: pressed ? theme.interaction.pressedOpacity : 1 }]}
      testID="today-tomorrow">
      <Surface style={[styles.tomorrowStrip, strongEdge]} variant="muted">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.alternateStage, {
            backgroundColor: theme.colors.garmentGround,
            height: measureGarmentBoardHeight(tomorrow.boardPieces, TOMORROW_BOARD_WIDTH, 'today', false, easierToSee),
            width: TOMORROW_BOARD_WIDTH,
          }]}>
          {/* The same garment plate the alternates stand on, so dark mode draws it alike. */}
          <OnPlate color={theme.colors.garmentGround}>
            <GarmentBoard
              accessibilityLabel=""
              decorative
              palette={tomorrow.palette}
              pieces={tomorrow.boardPieces}
              preset="today"
              testID="today-tomorrow-board"
              width={TOMORROW_BOARD_WIDTH}
            />
          </OnPlate>
        </View>
        <View style={styles.tomorrowText}>
          <AppText colorRole="textSecondary" testID="today-tomorrow-heading" variant="caption">
            {tomorrow.heading}
          </AppText>
          <AppText testID="today-tomorrow-title" variant="label">{tomorrow.title}</AppText>
          <AppText colorRole="textSecondary" tabularNumbers testID="today-tomorrow-weather" variant="caption">
            {tomorrow.weather}
          </AppText>
        </View>
        <Icon color={theme.colors.iconSecondary} name="chevronRight" size={16 * controlScale} />
      </Surface>
    </PressScale>
  );
}

// The strip's drawing: small enough to keep the strip thin, wide enough to read the outfit.
const TOMORROW_BOARD_WIDTH = 88;

// O13: the drawing inside a full-width alternate row, the mockup's 128 points.
const ALTERNATE_ROW_BOARD_WIDTH = 128;

const styles = StyleSheet.create({
  outfitName: { flex: 1, flexShrink: 1 },
  alternates: { marginTop: spacing.md },
  alternatesHeading: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  outfitList: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  // O13's alternate row: 60-point target and card radius; its edge is `strongEdge`.
  alternateRow: { alignItems: 'center', borderRadius: radii.card, flexDirection: 'row', gap: spacing.md,
    minHeight: easierToSeeValues.rowHeight, padding: spacing.md },
  alternateRowTitle: { flex: 1, marginTop: 0 },
  stackedOutfitList: { flexDirection: 'column', gap: spacing.md },
  alternateStage: { borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  tomorrowTarget: { marginTop: spacing.md },
  // Law 2: the strip's own inset is the container inset; it is never under the 44-point target.
  tomorrowStrip: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 44,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tomorrowText: { flex: 1, flexShrink: 1 },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
