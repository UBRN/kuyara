import { StyleSheet, View } from 'react-native';

import { AppText, Entrance, GarmentTileArtwork, Icon, type useGarmentRoles } from '@/components/ui';
import type { DetailPresentation, DetailSuggestion, TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { FadeOnChange } from '@/features/today/presentation/outfit-detail-fades';
import { plateTheme, radii, spacing } from '@/theme/theme';
import { DarkPlate, PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The detail draws its pieces at board scale; an accessory is not on the board, so it reads
// at Law 6's standalone mark step. The artwork fills about 60 percent of its box, so 28
// draws roughly 17 points of garment: enough for the silhouettes to stay apart from each
// other. It is deliberately larger than the 20 point reason-row icons, which are glyphs
// sized to the body line they sit beside rather than drawings that have to be recognised.
const ACCESSORY_ARTWORK_SIZE = 28;

/** The finishing touches, where the outfit was chosen, and the weather it was chosen for. */
export function OutfitDetailRecap({ accessories, copy, everChanged, pieceRoles, presentation, stageColor }: Readonly<{
  accessories: DetailSuggestion['accessories'];
  copy: TodayCopy;
  everChanged: boolean;
  pieceRoles: ReturnType<typeof useGarmentRoles>;
  presentation: DetailPresentation;
  stageColor: string;
}>) {
  const theme = useKuyaraTheme();
  return (
    <>
      {accessories.length > 0 ? (
        <View style={styles.section} testID="outfit-detail-finishing-touches">
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.finishingTouchesHeading}
          </AppText>
          <View style={styles.accessoryList}>
            {accessories.map((accessory) => (
              <View
                accessible
                accessibilityLabel={copy.finishingTouchesRowAccessibilityLabel({
                  item: accessory.item,
                  slot: accessory.slot,
                })}
                key={accessory.accessorySlot}
                style={styles.accessoryRow}
                testID={`outfit-detail-accessory-${accessory.garmentTypeId}`}>
                <DarkPlate style={styles.accessoryTile}>
                  <GarmentTileArtwork
                    category={accessory.category}
                    colorFamily={null}
                    roles={pieceRoles.get(accessory.accessorySlot)}
                    garmentTypeId={accessory.garmentTypeId}
                    glyphSize={ACCESSORY_ARTWORK_SIZE}
                    height={ACCESSORY_ARTWORK_SIZE}
                    photoTestID={`outfit-detail-accessory-photo-${accessory.garmentTypeId}`}
                    photoUri={null}
                    placeholderTestID={`outfit-detail-accessory-glyph-${accessory.garmentTypeId}`}
                    silhouetteTestID={`outfit-detail-accessory-silhouette-${accessory.garmentTypeId}`}
                    width={ACCESSORY_ARTWORK_SIZE}
                  />
                </DarkPlate>
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

      {/* ADR 0034 section 4: where the outfit was chosen is metadata, so it reads last,
          after the pieces and before the weather recap, as one plain sentence on the
          page ground. No card, no glyph, no accent, no pill, and no provider name. */}
      {presentation.generationSource ? (
        <FadeOnChange animate={everChanged} key={presentation.generationSource}>
          <AppText
            colorRole="textSecondary"
            style={styles.generationSource}
            testID="outfit-detail-generation-source"
            variant="caption">
            {presentation.generationSource}
          </AppText>
        </FadeOnChange>
      ) : null}

      <Entrance index={1}>
        <PlateView
          accessible
          accessibilityLabel={presentation.weather.recapAccessibilityLabel}
          color={stageColor}
          style={styles.weatherRecap}
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
              <Icon color={plateTheme(theme, stageColor).colors.textPrimary} name="clock" size={16} />
              <AppText colorRole="textPrimary" style={styles.weatherRecapCoverageText} tabularNumbers variant="caption">
                {presentation.coverageCaption}
              </AppText>
            </View>
          ) : null}
        </PlateView>
      </Entrance>
    </>
  );
}

const styles = StyleSheet.create({
  generationSource: {
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  accessoryList: {
    gap: spacing.sm,
  },
  accessoryTile: {
    borderRadius: radii.compact,
    padding: spacing.xs,
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
