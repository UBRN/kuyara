import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  measure,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, DrawGrow, Icon, type IconName } from '@/components/ui';
import { GarmentTileArtwork, type useGarmentRoles } from '@/garment-art';
import type { WeatherCause } from '@/features/recommendation/domain/weather-causes';
import {
  type DetailSuggestion,
  OWN_TILE_SIZE,
  type TodayCopy,
} from '@/features/today/presentation/outfit-detail-entries';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// "Why this outfit": each weather's glyph, at Law 6's body step beside its word.
const causeIcons: Readonly<Record<WeatherCause, IconName>> = {
  rain: 'conditionRain',
  snow: 'conditionSnow',
  cold: 'thermometerCold',
  heat: 'conditionClear',
  wind: 'wind',
  swing: 'thermometerSwing',
};
// The line from a weather to its pieces: a stroke, not a divider, so it reads in both appearances.
const WHY_LINE_WIDTH = 2;

/**
 * "Why this outfit" draws its lines once the whole section stands clear of the floating tab
 * bar, not while it is still below the fold or under the bar. The section's layout re-arms
 * the check; a scroll re-runs it until the section has been seen, and then it measures no more.
 */
export function useWhyInView(scrollOffset: SharedValue<number>, whyVisibleBottom: number) {
  const whyRef = useAnimatedRef<Animated.View>();
  const [whyLaidOut, setWhyLaidOut] = useState(0);
  const [whyInView, setWhyInView] = useState(false);
  useAnimatedReaction(() => {
    if (whyInView) return true;
    scrollOffset.get();
    if (whyLaidOut === 0) return false;
    const box = measure(whyRef);
    return box !== null && box.pageY + box.height < whyVisibleBottom;
  }, (inView, before) => {
    if (inView && !before) scheduleOnRN(setWhyInView, true);
  }, [whyInView, whyLaidOut, whyVisibleBottom]);
  return {
    whyRef,
    whyInView,
    onWhyLayout: whyInView ? undefined : () => setWhyLaidOut((count) => count + 1),
  };
}

type WhyInView = ReturnType<typeof useWhyInView>;

/**
 * "Why this outfit": each weather that put a piece in the outfit, drawn as a line to the
 * pieces it caused and said as one sentence, then the honest "but" of any trade-off the
 * outfit makes. The deterministic requirements decide it, never AI, and a change recomputes
 * it for the pieces worn. Mild weather with no trade-off leaves the section absent.
 */
export function OutfitDetailWhy({
  copy,
  onWhyLayout,
  pieceRoles,
  tradeoffs,
  weatherLinks,
  whyInView,
  whyRef,
}: Readonly<{
  copy: TodayCopy;
  pieceRoles: ReturnType<typeof useGarmentRoles>;
  tradeoffs: DetailSuggestion['requirementRows'];
  weatherLinks: DetailSuggestion['weatherLinks'];
  whyInView: boolean;
  whyRef: WhyInView['whyRef'];
  onWhyLayout: WhyInView['onWhyLayout'];
}>) {
  const theme = useKuyaraTheme();
  if (weatherLinks.length === 0 && tradeoffs.length === 0) return null;
  return (
    <Animated.View
      onLayout={onWhyLayout}
      ref={whyRef}
      style={styles.section}
      testID="outfit-detail-why">
      <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
        {copy.whyOutfit.heading}
      </AppText>
      <View style={styles.whyList}>
        {weatherLinks.map((link, index) => (
          <View
            accessible
            accessibilityLabel={link.text}
            key={link.cause}
            style={styles.whyRow}
            testID={`outfit-detail-why-${link.cause}`}>
            <View style={styles.whyLine}>
              <View style={styles.whyCause}>
                <Icon color={theme.colors.iconSecondary} name={causeIcons[link.cause]} size={20} />
                <AppText variant="bodyStrong">{link.label}</AppText>
              </View>
              <DrawGrow
                index={index}
                play
                style={[styles.whyStroke, { backgroundColor: theme.colors.iconSecondary }]}
                testID={`outfit-detail-why-line-${link.cause}`}
                waiting={!whyInView}
              />
              <View style={styles.whyPieces}>
                {link.pieces.map((piece) => (
                  <PlateView color={theme.colors.garmentTile} key={piece.slot} style={styles.ownTile}>
                    <GarmentTileArtwork
                      category={piece.category}
                      colorFamily={null}
                      garmentTypeId={piece.garmentTypeId}
                      glyphSize={OWN_TILE_SIZE * 0.6}
                      height={OWN_TILE_SIZE}
                      photoTestID={`outfit-detail-why-${link.cause}-photo-${piece.garmentTypeId}`}
                      photoUri={null}
                      placeholderTestID={`outfit-detail-why-${link.cause}-glyph-${piece.garmentTypeId}`}
                      roles={pieceRoles.get(piece.slot)}
                      silhouetteTestID={`outfit-detail-why-${link.cause}-silhouette-${piece.garmentTypeId}`}
                      width={OWN_TILE_SIZE}
                    />
                  </PlateView>
                ))}
              </View>
            </View>
            <AppText colorRole="textSecondary" style={styles.whyNames} variant="caption">
              {link.pieces.map(({ item }) => item).join(', ')}
            </AppText>
          </View>
        ))}
        {tradeoffs.map((row) => (
          // A trade-off is a status, so it keeps Law 4's warning ink, glyph and words.
          <View key={`tradeoff-${row.id}`} style={styles.tradeoffRow} testID={`outfit-detail-tradeoff-${row.id}`}>
            <Icon color={theme.colors.warningInk} name="warning" size={20} />
            <AppText colorRole="textSecondary" style={styles.flexText} variant="body">
              {row.text}
            </AppText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flexText: {
    flex: 1,
    flexShrink: 1,
  },
  ownTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: OWN_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: OWN_TILE_SIZE,
  },
  whyList: {
    gap: spacing.md,
  },
  whyRow: {
    gap: spacing.xs,
  },
  whyLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  whyCause: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
  },
  whyStroke: {
    borderRadius: WHY_LINE_WIDTH / 2,
    flexGrow: 1,
    height: WHY_LINE_WIDTH,
    minWidth: spacing.xl,
  },
  whyPieces: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  whyNames: {
    textAlign: 'right',
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  tradeoffRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
