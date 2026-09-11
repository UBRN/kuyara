import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  Button,
  GarmentBoard,
  Icon,
  layoutGarmentBoard,
  NativeMenu,
  Pill,
  Screen,
  haptics,
  useTextScaling,
} from '@/components/ui';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import type { TodayScreenState } from '@/features/today/model';
import type { GarmentOwnershipState } from '@/features/wardrobe/domain/garment-type-ownership';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

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
  const { hour12 } = useLocalization();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const [contentWidth, setContentWidth] = useState(0);
  const [captionHeights, setCaptionHeights] = useState<Readonly<Record<string, number>>>({});
  const [piecesSettled, setPiecesSettled] = useState(theme.isReduceMotionEnabled);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));
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
    return (
      <Screen testID="outfit-detail-screen">
        <Button label={backLabel} onPress={onBack} variant="quiet" />
        <AppText accessibilityRole="header" variant="titleLarge">
          {presentation.kind === 'loaded' ? presentation.copy.title : presentation.title}
        </AppText>
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];

  // Law 8: the owned/wanted pair mirrors the wardrobe toggle, a selection change under the finger.
  const setOwnership = (garmentTypeId: GarmentTypeId, next: 'owned' | 'wanted') => {
    haptics.selection();
    onSetOwnership(garmentTypeId, next);
  };

  const ownedCount = suggestion.pieces.filter(
    ({ garmentTypeId }) => ownershipByGarmentType[garmentTypeId] === 'owned',
  ).length;

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
        <Button label={backLabel} onPress={onBack} style={styles.backButton} variant="quiet" />

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
            pieces={suggestion.boardPieces}
            preset="detail"
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

        <View style={styles.ownershipSummary} testID="outfit-detail-ownership-summary">
          <Icon color={theme.colors.brandAccent} name="info" size={16} />
          <AppText colorRole="textSecondary" style={styles.ownershipSummaryText} variant="caption">
            {copy.ownershipSummary({ owned: ownedCount, total: suggestion.pieces.length })}
          </AppText>
        </View>

        {suggestion.requirementRows.length > 0 ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.reasonsHeading}
            </AppText>
            <View style={styles.reasonList}>
              {suggestion.requirementRows.map((row) => (
                <View key={row.id} style={styles.reasonRow}>
                  <Icon
                    color={row.kind === 'tradeoff' ? theme.colors.warningInk : theme.colors.brandAccent}
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

        <View
          accessible
          accessibilityLabel={[
            presentation.weather.temperature,
            presentation.weather.condition,
            presentation.weather.rainProbability,
          ].join(', ')}
          style={[styles.weatherRecap, { backgroundColor: stageColor }]}
          testID="outfit-detail-weather-recap">
          <AppText tabularNumbers variant="caption">{presentation.weather.temperature}</AppText>
          <AppText colorRole="textPrimary" variant="caption">{presentation.weather.condition}</AppText>
          <AppText colorRole="textPrimary" tabularNumbers variant="caption">
            {presentation.weather.rainProbability}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
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
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reasonList: {
    gap: spacing.sm,
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
    alignItems: 'center',
    borderRadius: radii.card,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.md,
    padding: spacing.lg,
  },
});
