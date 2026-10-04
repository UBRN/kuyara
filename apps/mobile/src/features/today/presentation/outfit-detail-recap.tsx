import type { Ref, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Entrance, GarmentTileArtwork, Icon, type useGarmentRoles, useTextScaling } from '@/components/ui';
import type { AccessoryOutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { DetailPresentation, DetailSuggestion, TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { FadeOnChange } from '@/features/today/presentation/outfit-detail-fades';
import { DetailAddRow } from '@/features/today/presentation/outfit-detail-pieces';
import { plateTheme, radii, spacing } from '@/theme/theme';
import { DarkPlate, PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The detail draws its pieces at board scale; an accessory is not on the board, so it reads
// at Law 6's standalone mark step. The artwork fills about 60 percent of its box, so 28
// draws roughly 17 points of garment: enough for the silhouettes to stay apart from each
// other. It is deliberately larger than the 20 point reason-row icons, which are glyphs
// sized to the body line they sit beside rather than drawings that have to be recognised.
const ACCESSORY_ARTWORK_SIZE = 28;

/**
 * The finishing touches, where the outfit was chosen, and the weather it was chosen for. The
 * finishing touches are the reader's to edit (ADR 0026 section 6): each has its own Take off,
 * a taken-off one leaves the list for one closing line with Put back, and "Add an accessory"
 * ends the list, so the heading stays even when kuyara chose none.
 */
export function OutfitDetailRecap({
  accessories,
  accessoryTargets,
  addedAccessorySlots = [],
  copy,
  everChanged,
  onAddAccessory,
  onPutBack,
  onTakeOff,
  pieceRoles,
  presentation,
  removedCount = 0,
  removedTarget,
  source,
  stageColor,
}: Readonly<{
  accessories: DetailSuggestion['accessories'];
  /** Each finishing touch's words by slot, so focus can land on one put back. */
  accessoryTargets?: RefObject<Map<AccessoryOutfitSlot, View>>;
  addedAccessorySlots?: readonly AccessoryOutfitSlot[];
  copy: TodayCopy;
  everChanged: boolean;
  /** Present while an accessory slot is free. */
  onAddAccessory?: () => void;
  onPutBack?: () => void;
  onTakeOff?: (slot: AccessoryOutfitSlot) => void;
  pieceRoles: ReturnType<typeof useGarmentRoles>;
  presentation: DetailPresentation;
  /** How many of kuyara's finishing touches are off: the closing line's count. */
  removedCount?: number;
  /** The closing line's words, where VoiceOver lands once a finishing touch is taken off. */
  removedTarget?: Ref<View>;
  /** Where the outfit was chosen, one plain sentence. */
  source: string | null;
  stageColor: string;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  const mix = copy.manualMix;
  return (
    <>
      {accessories.length > 0 || onAddAccessory || removedCount > 0 ? (
        <View style={styles.section} testID="outfit-detail-finishing-touches">
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.finishingTouchesHeading}
          </AppText>
          <View style={styles.accessoryList}>
            {accessories.map((accessory) => {
              const added = addedAccessorySlots.includes(accessory.accessorySlot);
              const subtitle = added ? mix.accessoryAdded(accessory.slot) : accessory.slot;
              // Spoken with a comma pause where the subtitle shows a middle dot.
              const label = copy.finishingTouchesRowAccessibilityLabel({ item: accessory.item, slot: accessory.slot });
              return (
                <View key={accessory.accessorySlot} style={styles.accessoryRow}>
                  {/* The row's words are one element and its Take off another, each one sentence. */}
                  <View
                    accessible
                    accessibilityLabel={added ? `${label}, ${mix.added}` : label}
                    ref={(node) => {
                      if (node) accessoryTargets?.current.set(accessory.accessorySlot, node);
                      else accessoryTargets?.current.delete(accessory.accessorySlot);
                    }}
                    style={styles.accessoryMain}
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
                      <AppText colorRole="textSecondary" variant="caption">{subtitle}</AppText>
                    </View>
                  </View>
                  {onTakeOff ? (
                    <Button
                      accessibilityLabel={mix.accessoryTakeOffAccessibilityLabel[accessory.accessorySlot](accessory.item)}
                      label={mix.takeOff}
                      onPress={() => onTakeOff(accessory.accessorySlot)}
                      size="medium"
                      testID={`outfit-detail-accessory-take-off-${accessory.accessorySlot}`}
                      variant="plain"
                    />
                  ) : null}
                </View>
              );
            })}
            {removedCount > 0 ? (
              <View style={styles.accessoryRow} testID="outfit-detail-accessories-removed">
                <View accessible ref={removedTarget} style={styles.accessoryMain}
                  testID="outfit-detail-accessories-removed-text">
                  <PlateView color={theme.colors.surfaceMuted} style={styles.removedTile}>
                    <Icon color={theme.colors.textSecondary} name="minus" size={16} />
                  </PlateView>
                  <AppText colorRole="textSecondary" style={styles.accessoryText} variant="caption">
                    {mix.accessoriesTookOff(removedCount)}
                  </AppText>
                </View>
                {onPutBack ? (
                  <Button
                    accessibilityLabel={mix.putBackAccessibilityLabel(removedCount)}
                    label={mix.putBack}
                    onPress={onPutBack}
                    size="medium"
                    testID="outfit-detail-accessories-put-back"
                    variant="plain"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
          {onAddAccessory ? (
            <DetailAddRow
              hint={mix.addAccessoryHint}
              onPress={onAddAccessory}
              testID="outfit-detail-add-accessory"
              title={mix.addAccessory}
            />
          ) : null}
        </View>
      ) : null}

      {/* ADR 0034 section 4: where the outfit was chosen is metadata, so it reads last,
          after the pieces and before the weather recap, as one plain sentence on the
          page ground. No card, no glyph, no accent, no pill, and no provider name. */}
      {source ? (
        <FadeOnChange animate={everChanged} key={source}>
          <AppText
            colorRole="textSecondary"
            style={styles.generationSource}
            testID="outfit-detail-generation-source"
            variant="caption">
            {source}
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
              <Icon color={plateTheme(theme, stageColor).colors.textPrimary} name="clock" size={16 * controlScale} />
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
  accessoryMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  accessoryText: {
    flex: 1,
    flexShrink: 1,
  },
  removedTile: {
    alignItems: 'center',
    borderRadius: radii.compact,
    height: ACCESSORY_ARTWORK_SIZE + 2 * spacing.xs,
    justifyContent: 'center',
    width: ACCESSORY_ARTWORK_SIZE + 2 * spacing.xs,
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
