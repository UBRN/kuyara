import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  GlassButton,
  Entrance,
  GarmentBoard,
  GarmentTileArtwork,
  Icon,
  layoutGarmentBoard,
  NativeMenu,
  Pill,
  Screen,
  haptics,
  useGarmentRoles,
  useTextScaling,
} from '@/components/ui';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import type { TodayScreenState } from '@/features/today/model';
import type { GarmentOwnershipState } from '@/features/wardrobe/domain/garment-type-ownership';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The detail draws its pieces at board scale; an accessory is not on the board, so it reads
// at Law 6's standalone mark step. The artwork fills about 60 percent of its box, so 28
// draws roughly 17 points of garment: enough for the silhouettes to stay apart from each
// other. It is deliberately larger than the 20 point reason-row icons, which are glyphs
// sized to the body line they sit beside rather than drawings that have to be recognised.
const ACCESSORY_ARTWORK_SIZE = 28;

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  onBack: () => void;
  backLabel: string;
  ownershipByGarmentType: Readonly<Record<string, GarmentOwnershipState>>;
  ownershipError?: string | null;
  onSetOwnership: (
    garmentTypeId: GarmentTypeId,
    next: 'owned' | 'wanted',
  ) => boolean | void;
}>;

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  onBack,
  backLabel,
  ownershipByGarmentType,
  ownershipError = null,
  onSetOwnership,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const { hour12 } = useLocalization();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const [contentWidth, setContentWidth] = useState(0);
  const [captionHeights, setCaptionHeights] = useState<Readonly<Record<string, number>>>({});
  const [piecesSettled, setPiecesSettled] = useState(false);
  const [completions, setCompletions] = useState(0);
  const now = useForegroundClock();
  const onPiecesSettled = useCallback(() => setPiecesSettled(true), []);
  const captionEntranceStyle = useAnimatedStyle(() => ({
    opacity: withTiming(piecesSettled ? 1 : 0, { duration: theme.motion.fast }),
  }), [piecesSettled, theme.motion.fast]);
  const copy = getMessages(language).today;
  const presentation = createTodayPresentation(state, language, hour12, now);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;
  // The finishing touches keep the colours the outfit's palette gave them on Today (O15).
  const accessoryRoles = useGarmentRoles(suggestion?.palette ?? null);
  const boardLayout = suggestion
    ? layoutGarmentBoard(suggestion.boardPieces, contentWidth, 'detail')
    : { height: 0, boxes: [] };
  const initialCaptionHeight = theme.typography.body.lineHeight * fontScale * 2;
  // Above 1.5 the captions leave the plate (see the caption list below), so the plate is
  // exactly the board and nothing has to be reserved for text inside it.
  const plateHeight = usesStackedLayout
    ? boardLayout.height
    : Math.max(
        boardLayout.height,
        ...boardLayout.boxes.map((box) => {
          const caption = createDetailCaptionLayout(box, contentWidth);
          return caption.top + (captionHeights[box.slot] ?? initialCaptionHeight);
        }),
      );

  if (presentation.kind !== 'loaded' || !suggestion) {
    const missingSuggestion = presentation.kind === 'loaded';
    return (
      <Screen testID="outfit-detail-screen">
        <GlassButton kind="back" label={backLabel} onPress={onBack} testID="outfit-detail-back" />
        <AppText accessibilityRole="header" variant="titleLarge">
          {missingSuggestion ? copy.noOutfitTitle : presentation.title}
        </AppText>
        {missingSuggestion ? (
          <AppText colorRole="textSecondary" style={styles.missingSuggestionBody} variant="body">
            {copy.noOutfitBody}
          </AppText>
        ) : null}
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];

  const ownedCount = suggestion.pieces.filter(
    ({ garmentTypeId }) => ownershipByGarmentType[garmentTypeId] === 'owned',
  ).length;

  // Law 8: the owned/wanted pair mirrors the wardrobe toggle, a selection change under
  // the finger. The press that completes the outfit is the exception: it fires the
  // success notification instead, one press and one haptic, and asks the board for
  // Law 7's single settle. The caption menu never reports the state it already shows,
  // so a press to `owned` always raises the count by one.
  const setOwnership = (garmentTypeId: GarmentTypeId, next: 'owned' | 'wanted') => {
    if (onSetOwnership(garmentTypeId, next) === false) return;

    if (next === 'owned' && ownedCount + 1 === suggestion.pieces.length) {
      haptics.success();
      setCompletions((count) => count + 1);
    } else {
      haptics.selection();
    }

  };

  const captionEntries = boardLayout.boxes.flatMap((box) => {
    const piece = suggestion.pieces.find(
      ({ garmentTypeId }) => garmentTypeId === box.garmentTypeId,
    );
    if (!piece) return [];

    const ownership = ownershipByGarmentType[piece.garmentTypeId] ?? 'none';
    // Owned and wanted are the exceptions worth a mark; an untracked garment is the
    // default and stays visually quiet so the two tracked states keep their weight.
    // Assistive tech still hears the state, so the silence is never ambiguous.
    const ownershipLabel = ownership === 'owned'
      ? copy.ownershipOwnedLabel
      : ownership === 'wanted'
        ? copy.ownershipWantedLabel
        : null;

    return [{
      box,
      piece,
      ownership,
      ownershipLabel,
      spokenOwnership: ownershipLabel ?? copy.ownershipUntrackedLabel,
    }];
  });

  // In place up to 1.5, one list under the plate above it: at accessibility sizes the
  // measured caption boxes break by character and overlap each other and the footwear.
  // Same content, same single accessible element, same test id in both branches.
  const renderCaption = ({
    box,
    piece,
    ownership,
    ownershipLabel,
    spokenOwnership,
  }: (typeof captionEntries)[number]) => {
    const captionLayout = usesStackedLayout
      ? null
      : createDetailCaptionLayout(box, contentWidth);
    const captionWidth = captionLayout?.width ?? contentWidth;
    const captionHeight = captionHeights[box.slot] ?? initialCaptionHeight;
    // Centred text belongs under a centred piece; in the list the box shrinks to its
    // content and wrapped lines read from the left edge like every other list.
    const captionTextStyle = captionLayout ? styles.captionText : undefined;

    return (
      <View
        key={box.slot}
        style={captionLayout ? [styles.captionPosition, captionLayout] : undefined}>
        <NativeMenu
          accessibilityHint={copy.ownershipChangeHint}
          accessibilityLabel={`${piece.item}, ${piece.slot}, ${spokenOwnership}`}
          height={captionHeight}
          hitSlop={spacing.sm}
          items={[
            {
              id: 'owned',
              label: copy.ownershipOwnedAction,
              selected: ownership === 'owned',
            },
            {
              id: 'wanted',
              label: copy.ownershipWantedAction,
              selected: ownership === 'wanted',
            },
          ]}
          onSelect={(next) => {
            if (next === 'owned' || next === 'wanted') {
              setOwnership(piece.garmentTypeId, next);
            }
          }}
          testID={`outfit-detail-caption-${piece.garmentTypeId}`}
          width={captionWidth}>
          <View
            onLayout={({ nativeEvent }) => {
              const height = nativeEvent.layout.height;
              if (captionHeights[box.slot] === height) return;
              setCaptionHeights((current) => ({ ...current, [box.slot]: height }));
            }}
            style={captionLayout ? styles.caption : styles.stackedCaption}
            testID={`outfit-detail-caption-content-${piece.garmentTypeId}`}>
            <AppText style={captionTextStyle} variant="bodyStrong">
              {piece.item}
            </AppText>
            <View style={styles.captionMeta}>
              <AppText colorRole="textSecondary" style={captionTextStyle} variant="caption">
                {piece.slot}
              </AppText>
              {ownershipLabel ? (
                <View style={styles.ownershipState}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.ownershipMarker,
                      ownership === 'owned'
                        ? {
                            backgroundColor: theme.colors.brandAccent,
                            borderColor: theme.colors.brandAccent,
                          }
                        : { borderColor: theme.colors.brandAccent },
                    ]}
                    testID={`outfit-detail-ownership-marker-${piece.garmentTypeId}`}
                  />
                  <AppText colorRole="textSecondary" variant="caption">
                    {ownershipLabel}
                  </AppText>
                </View>
              ) : null}
              <Icon color={theme.colors.textSecondary} name="menuIndicator" size={16} />
            </View>
          </View>
        </NativeMenu>
      </View>
    );
  };

  return (
    <Screen testID="outfit-detail-screen">
      <View
        onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
        testID="outfit-detail-content">
        <GlassButton kind="back" label={backLabel} onPress={onBack} testID="outfit-detail-back" />

        <View
          style={[styles.headingGroup, usesStackedLayout && styles.stackedHeadingGroup]}
          testID="outfit-detail-heading-group">
          <AppText accessibilityRole="header" variant="title">
            {suggestion.title}
          </AppText>
          {suggestion.emphasis ? <Pill label={suggestion.emphasis} tone="accent-filled" /> : null}
        </View>

        <View
          style={[styles.boardPlate, { height: plateHeight, width: contentWidth }]}
          testID="outfit-detail-board-plate">
          <GarmentBoard
            accessibilityLabel={suggestion.boardAccessibilityLabel}
            decorative
            entrance={{
              fromPreset: 'today',
              fromStageColor: stageColor,
              fromStageRadius: 26,
              onSettled: onPiecesSettled,
            }}
            // The opened outfit keeps the palette it had on Today (O15). The plate stands on
            // the page ground, so every fill is made legible on `background`.
            palette={suggestion.palette}
            pieces={suggestion.boardPieces}
            preset="detail"
            settle={completions}
            testID="outfit-detail-board"
            width={contentWidth}
          />
          {usesStackedLayout ? null : (
            <Animated.View
              style={[styles.captionOverlay, captionEntranceStyle]}
              testID="outfit-detail-caption-overlay">
              {captionEntries.map(renderCaption)}
            </Animated.View>
          )}
        </View>

        {usesStackedLayout ? (
          <Animated.View
            style={[styles.captionList, captionEntranceStyle]}
            testID="outfit-detail-caption-list">
            {captionEntries.map(renderCaption)}
          </Animated.View>
        ) : null}

        <Entrance>
          <View style={styles.ownershipSummary} testID="outfit-detail-ownership-summary">
            <Icon color={theme.colors.brandAccent} name="info" size={16} />
            <AppText colorRole="textSecondary" style={styles.ownershipSummaryText} variant="caption">
              {copy.ownershipSummary({ owned: ownedCount, total: suggestion.pieces.length })}
            </AppText>
          </View>
        </Entrance>

        {ownershipError ? (
          <AppText
            accessibilityRole="alert"
            colorRole="dangerInk"
            style={styles.ownershipError}
            variant="caption">
            {ownershipError}
          </AppText>
        ) : null}

        {suggestion.accessories.length > 0 ? (
          <View style={styles.section} testID="outfit-detail-finishing-touches">
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.finishingTouchesHeading}
            </AppText>
            <View style={styles.accessoryList}>
              {suggestion.accessories.map((accessory) => (
                <View
                  accessible
                  accessibilityLabel={copy.finishingTouchesRowAccessibilityLabel({
                    item: accessory.item,
                    slot: accessory.slot,
                  })}
                  key={accessory.accessorySlot}
                  style={styles.accessoryRow}
                  testID={`outfit-detail-accessory-${accessory.garmentTypeId}`}>
                  <GarmentTileArtwork
                    category={accessory.category}
                    colorFamily={null}
                    roles={accessoryRoles.get(accessory.accessorySlot)}
                    garmentTypeId={accessory.garmentTypeId}
                    glyphSize={ACCESSORY_ARTWORK_SIZE}
                    height={ACCESSORY_ARTWORK_SIZE}
                    photoTestID={`outfit-detail-accessory-photo-${accessory.garmentTypeId}`}
                    photoUri={null}
                    placeholderTestID={`outfit-detail-accessory-glyph-${accessory.garmentTypeId}`}
                    silhouetteTestID={`outfit-detail-accessory-silhouette-${accessory.garmentTypeId}`}
                    width={ACCESSORY_ARTWORK_SIZE}
                  />
                  <View style={styles.accessoryText}>
                    <AppText variant="bodyStrong">{accessory.item}</AppText>
                    <AppText colorRole="textSecondary" variant="caption">
                      {accessory.slot}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {suggestion.requirementRows.length > 0 ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.reasonsHeading}
            </AppText>
            <View style={styles.reasonList}>
              {suggestion.requirementRows.map((row) => (
                <View key={row.id} style={styles.reasonRow}>
                  {/* Law 1's accent budget: a satisfied requirement is a bullet beside its
                      sentence, not a status site, so it carries the secondary icon ink and
                      leaves the viewport's one accent fill to the ownership markers. A
                      tradeoff is a real status and keeps Law 4's ink, glyph and text. */}
                  <Icon
                    color={row.kind === 'tradeoff' ? theme.colors.warningInk : theme.colors.iconSecondary}
                    name={row.kind === 'tradeoff' ? 'warning' : 'checkCircle'}
                    size={20}
                  />
                  <AppText colorRole="textSecondary" style={styles.reasonText} variant="body">
                    {row.text}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ADR 0034 section 4: where the outfit was chosen is metadata, so it reads last,
            after the reasons and before the weather recap, as one plain sentence on the
            page ground. No card, no glyph, no accent, no pill, and no provider name. */}
        {presentation.generationSource ? (
          <AppText
            colorRole="textSecondary"
            style={styles.generationSource}
            testID="outfit-detail-generation-source"
            variant="caption">
            {presentation.generationSource}
          </AppText>
        ) : null}

        <Entrance index={1}>
          <View
            accessible
            accessibilityLabel={[
              presentation.weather.temperature,
              presentation.weather.condition,
              presentation.weather.rainProbability,
              ...(presentation.coverageCaption ? [presentation.coverageCaption] : []),
            ].join(', ')}
            style={[styles.weatherRecap, { backgroundColor: stageColor }]}
            testID="outfit-detail-weather-recap">
            <View style={styles.weatherRecapValues}>
              <AppText tabularNumbers variant="caption">{presentation.weather.temperature}</AppText>
              <AppText colorRole="textPrimary" variant="caption">{presentation.weather.condition}</AppText>
              <AppText colorRole="textPrimary" tabularNumbers variant="caption">
                {presentation.weather.rainProbability}
              </AppText>
            </View>
            {/* N18: the hours this outfit was chosen for belong with the weather they describe. */}
            {presentation.coverageCaption ? (
              <View style={styles.weatherRecapCoverage} testID="outfit-detail-coverage">
                <Icon color={theme.colors.textPrimary} name="clock" size={16} />
                <AppText colorRole="textPrimary" style={styles.weatherRecapCoverageText} tabularNumbers variant="caption">
                  {presentation.coverageCaption}
                </AppText>
              </View>
            ) : null}
          </View>
        </Entrance>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  missingSuggestionBody: {
    marginTop: spacing.sm,
  },
  generationSource: {
    marginTop: spacing.md,
  },
  headingGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  // Above fontScale 1.5 the emphasis pill sits under the title instead of leaving the screen.
  stackedHeadingGroup: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  boardPlate: {
    marginTop: spacing.xl,
    position: 'relative',
  },
  caption: {
    alignItems: 'center',
  },
  captionPosition: {
    position: 'absolute',
  },
  captionOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  captionList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  stackedCaption: {
    alignItems: 'flex-start',
  },
  captionText: {
    textAlign: 'center',
  },
  captionMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  ownershipState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ownershipMarker: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.strong,
    height: spacing.sm,
    width: spacing.sm,
  },
  ownershipSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ownershipSummaryText: {
    flex: 1,
    flexShrink: 1,
  },
  ownershipError: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reasonList: {
    gap: spacing.sm,
  },
  accessoryList: {
    gap: spacing.sm,
  },
  accessoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  accessoryText: {
    flex: 1,
    flexShrink: 1,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonText: {
    flex: 1,
    flexShrink: 1,
  },
  weatherRecap: {
    borderRadius: radii.card,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  weatherRecapValues: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  weatherRecapCoverage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  weatherRecapCoverageText: {
    flexShrink: 1,
  },
});
