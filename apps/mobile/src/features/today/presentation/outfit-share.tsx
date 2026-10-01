import { Stack } from 'expo-router';
import { useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  AppText,
  GarmentBoard,
  Icon,
  measureGarmentBoardHeight,
  type GarmentOutfitPalette,
} from '@/components/ui';
import { brandSymbolPaths, brandSymbolViewBox } from '@/components/ui/brand-symbol';
import { shareSnapshot } from '@/components/ui/share-snapshot';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import type {
  LoadedOutfitPresentation,
  LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useLocalization } from '@/localization/use-messages';
import { useEasierToSee } from '@/theme/easier-to-see';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// A 9:16 card, a story's shape: 1080 by 1920 pixels on a 3x screen.
const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;
const CARD_INSET = spacing.xl;
const BOARD_WIDTH = CARD_WIDTH - CARD_INSET * 2;
// Today's stage plate, so the shared board stands where the user first saw it.
const STAGE_RADIUS = 26;
// Law 6: 20 beside the body line; the symbol's master viewBox keeps its own margin, so the
// lockup's mark is drawn at 28 to read at the name's height.
const WEATHER_SYMBOL_SIZE = 20;
const BRAND_SYMBOL_SIZE = 28;

type ShareProps = Readonly<{
  presentation: LoadedTodayPresentation;
  suggestion: LoadedOutfitPresentation;
  /** The palette detail draws the outfit in, kept colours included (O15). */
  palette: GarmentOutfitPalette;
}>;

/**
 * The detail toolbar's share button. A press draws the outfit card off screen, hands it to the
 * share sheet as an image, and unmounts it. iOS only: Android's share sheet takes no file from
 * React Native's own Share API.
 */
export function OutfitShareAction(props: ShareProps) {
  const { messages } = useLocalization();
  const cardRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  if (Platform.OS !== 'ios') return null;

  const capture = () => {
    void shareSnapshot(cardRef).then(() => setCapturing(false));
  };

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={messages.today.share.action}
          disabled={capturing}
          icon="square.and.arrow.up"
          onPress={() => setCapturing(true)}
        />
      </Stack.Toolbar>
      {capturing ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.offscreen}>
          {/* Laid out once, then drawn on the next frame. */}
          <OutfitShareCard {...props} onLayout={() => requestAnimationFrame(capture)} ref={cardRef} />
        </View>
      ) : null}
    </>
  );
}

/** The shared image: the outfit on its weather stage, the day, and the kuyara name. */
export function OutfitShareCard({
  presentation,
  suggestion,
  palette,
  onLayout,
  ref,
}: ShareProps & Readonly<{ onLayout?: () => void; ref?: Ref<View> }>) {
  const theme = useKuyaraTheme();
  const { messages } = useLocalization();
  const easierToSee = useEasierToSee();
  const { weather, titleParts } = presentation;
  const conditionStyle = resolveConditionStyle(weather.conditionCode, weather.daypart);

  return (
    <View
      collapsable={false}
      onLayout={onLayout}
      ref={ref}
      style={[styles.card, { backgroundColor: theme.colors.background }]}
      testID="outfit-share-card">
      {/* The outfit block stands centred in the story frame, the name at its foot. */}
      <View style={styles.body}>
        <View style={styles.heading}>
          <AppText colorRole="textSecondary" tabularNumbers variant="caption">
            {presentation.date}
          </AppText>
          <AppText numberOfLines={2} variant="title">{suggestion.title}</AppText>
        </View>
        <View style={styles.middle}>
          <View
            style={[styles.stage, {
              backgroundColor: theme.atmosphere[presentation.atmosphere],
              height: measureGarmentBoardHeight(suggestion.boardPieces, BOARD_WIDTH, 'today', true, easierToSee),
            }]}>
            <GarmentBoard
              accessibilityLabel={suggestion.boardAccessibilityLabel}
              contactShade={theme.contactShade[presentation.atmosphere]}
              decorative
              fit
              palette={palette}
              pieces={suggestion.boardPieces}
              preset="today"
              stageColor={theme.atmosphere[presentation.atmosphere]}
              width={BOARD_WIDTH}
            />
          </View>
          <View style={styles.row}>
            <AppText tabularNumbers variant="bodyStrong">{titleParts.beforeSymbol}</AppText>
            <Icon color={theme.condition[conditionStyle.ink]} name={conditionStyle.shape} size={WEATHER_SYMBOL_SIZE} />
            <AppText numberOfLines={1} style={styles.shrink} variant="body">
              {titleParts.afterSymbol}
            </AppText>
          </View>
        </View>
      </View>
      <View style={styles.row}>
        <Svg
          height={BRAND_SYMBOL_SIZE}
          viewBox={`0 0 ${brandSymbolViewBox} ${brandSymbolViewBox}`}
          width={BRAND_SYMBOL_SIZE}>
          {brandSymbolPaths.map((d) => <Path d={d} fill={theme.colors.brandAccent} key={d} />)}
        </Svg>
        <AppText variant="bodyStrong">{messages.today.share.brandName}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Out of the window's bounds but in its hierarchy, so the capture can draw it.
  offscreen: { left: -CARD_WIDTH * 4, position: 'absolute', top: 0 },
  card: {
    height: CARD_HEIGHT,
    paddingHorizontal: CARD_INSET,
    paddingVertical: spacing['2xl'],
    width: CARD_WIDTH,
  },
  body: { flex: 1, gap: spacing.xl, justifyContent: 'center' },
  heading: { gap: spacing.xs },
  middle: { gap: spacing.md },
  stage: { borderRadius: STAGE_RADIUS, overflow: 'hidden', width: BOARD_WIDTH },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  shrink: { flexShrink: 1 },
});
