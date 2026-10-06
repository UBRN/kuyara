import { Link } from 'expo-router';
import { FlatList, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText, Entrance, Icon, PressScale, Surface, useTextScaling } from '@/components/ui';
import { GarmentBoard, measureGarmentBoardHeight, useGarmentCut } from '@/garment-art';
import type { OutfitDetailLink } from '@/features/today/presentation/today-outfit';
import type {
  LoadedOutfitPresentation,
  TomorrowPreviewPresentation,
} from '@/features/today/presentation/today-presentation';
import { layout, radii, spacing } from '@/theme/theme';
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
  const cut = useGarmentCut();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // The two tiles share the row's own gap, so the width follows `styles.outfitList`. O13
  //: while Easier to see is on, each alternate is a full-width row
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
      measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today', cut, false, easierToSee),
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
        {alternates.map((suggestion, index) => (
          <Entrance index={index + 1} key={suggestion.id}>
            <OutfitTile
              onOpenOutfitDetail={onOpenOutfitDetail}
              outfitDetailLink={outfitDetailLink}
              row={easierToSee}
              stageHeight={alternateStageHeight}
              suggestion={suggestion}
              testID="today-alternate"
              width={alternateWidth}
            />
          </Entrance>
        ))}
      </View>
    </View>
  );
}

/**
 * One outfit that opens its detail: its drawing on the garment plate, its name and a chevron.
 * With the route's link the drawing is the iOS zoom source. `row` is O13's full-width row.
 */
function OutfitTile({
  onOpenOutfitDetail,
  outfitDetailLink,
  row,
  stageHeight,
  suggestion,
  testID,
  width,
}: Readonly<{
  onOpenOutfitDetail: (id: string) => void;
  outfitDetailLink: OutfitDetailLink | undefined;
  row: boolean;
  stageHeight: number;
  suggestion: LoadedOutfitPresentation;
  testID: string;
  width: number;
}>) {
  const theme = useKuyaraTheme();
  // The one source for the strong edge: the switch or iOS Increase
  // Contrast. A full-width row wears it; a tile wears it on its drawing plate.
  const strongEdge = useStrongEdge();
  const { controlScale } = useTextScaling();
  const stage = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // A zoom source keeps only an object style, as the link below does.
      style={StyleSheet.flatten<ViewStyle>([
        styles.alternateStage,
        { backgroundColor: theme.colors.garmentGround, height: stageHeight, width },
        row ? null : strongEdge,
      ])}
      testID={`${testID}-stage-${suggestion.id}`}>
      {/* O15: each outfit stands on the page ground in its own palette, so it looks the
          same here as on Today's stage once chosen. */}
      <OnPlate color={theme.colors.garmentGround}>
        <GarmentBoard
          accessibilityLabel={suggestion.boardAccessibilityLabel}
          palette={suggestion.palette}
          pieces={suggestion.boardPieces}
          preset="today"
          testID={`${testID}-board-${suggestion.id}`}
          width={width}
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
      style={StyleSheet.flatten<ViewStyle>(row ? [styles.alternateRow, strongEdge] : { width })}
      testID={`${testID}-${suggestion.id}`}>
      {outfitDetailLink ? <Link.AppleZoom>{stage}</Link.AppleZoom> : stage}
      <View style={[styles.alternateTitleRow, row && styles.alternateRowTitle]}>
        <AppText numberOfLines={2} style={styles.outfitName} variant="label">
          {suggestion.title}
        </AppText>
        <Icon color={theme.colors.iconSecondary} name="chevronRight" size={16 * controlScale} />
      </View>
    </PressScale>
  );
  return outfitDetailLink ? (
    <Link asChild href={outfitDetailLink.href(suggestion.id)} onPress={outfitDetailLink.onPress} push>
      {card}
    </Link>
  ) : card;
}

/**
 * "More ideas": the composed pool past the outfits on screen, as small
 * tiles in one row that scrolls sideways out to the screen's edge. Each opens the outfit's
 * ordinary detail; nothing here asks the stylist again.
 */
export function MoreIdeas({
  caption,
  heading,
  ideas,
  onOpenOutfitDetail,
  outfitDetailLink,
}: Readonly<{
  caption: string;
  heading: string;
  ideas: readonly LoadedOutfitPresentation[];
  onOpenOutfitDetail: (id: string) => void;
  outfitDetailLink: OutfitDetailLink | undefined;
}>) {
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  const cut = useGarmentCut();
  // The tiles share the tallest stage, so every name sits on one baseline.
  const stageHeight = Math.max(0, ...ideas.map((idea) =>
    measureGarmentBoardHeight(idea.boardPieces, IDEA_WIDTH, 'today', cut, false, easierToSee)));
  return (
    <View style={styles.alternates}>
      <View
        style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}
        testID="today-more-ideas-heading">
        <AppText accessibilityRole="header" variant="bodyStrong">{heading}</AppText>
      </View>
      <AppText colorRole="textSecondary" style={styles.ideasCaption} variant="caption">{caption}</AppText>
      <FlatList
        contentContainerStyle={styles.ideasContent}
        data={ideas}
        horizontal
        keyExtractor={(idea) => idea.id}
        renderItem={({ item }) => (
          <OutfitTile
            onOpenOutfitDetail={onOpenOutfitDetail}
            outfitDetailLink={outfitDetailLink}
            row={false}
            stageHeight={stageHeight}
            suggestion={item}
            testID="today-more-idea"
            width={IDEA_WIDTH}
          />
        )}
        showsHorizontalScrollIndicator={false}
        style={styles.ideasList}
        testID="today-more-ideas-list"
      />
    </View>
  );
}

// B: tomorrow's strip, one button: a small drawing of the outfit, the day, its name and its
// weather in one short line, and a chevron. It sits on the muted fill the other Today rows
// use, so it reads as a way somewhere rather than as a second hero.
export function TomorrowStrip({ onPress, tomorrow }: Readonly<{ onPress: () => void; tomorrow: TomorrowPreviewPresentation }>) {
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  const cut = useGarmentCut();
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
            height: measureGarmentBoardHeight(tomorrow.boardPieces, TOMORROW_BOARD_WIDTH, 'today', cut, false, easierToSee),
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

// An idea's tile: the mockup's 132 points, smaller than an alternative.
const IDEA_WIDTH = 132;

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
  alternateStage: { borderRadius: radii.imageTile, justifyContent: 'center', overflow: 'hidden' },
  tomorrowTarget: { marginTop: spacing.md },
  // Law 2: the strip's own inset is the container inset; it is never under the 44-point target.
  tomorrowStrip: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tomorrowText: { flex: 1, flexShrink: 1 },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  ideasCaption: { marginTop: spacing.sm },
  // The row runs out to the screen's edge past the container inset; its end keeps the inset.
  ideasList: { marginRight: -spacing.lg, marginTop: spacing.md },
  ideasContent: { gap: spacing.md, paddingRight: spacing.lg },
});
