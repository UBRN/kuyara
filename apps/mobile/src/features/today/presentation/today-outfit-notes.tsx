import type { DressStyle } from '@kuyara/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText, Crossfade, GarmentDrawing, Icon, useGarmentRoles, useTextScaling } from '@/components/ui';
import type { TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { ArrivesAfterHandoff, Dimmed, PhaseMark } from '@/features/today/presentation/today-motion';
import type {
  LoadedOutfitPresentation,
  LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { radii, spacing } from '@/theme/theme';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { DarkPlate } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6: a drawing beside caption text is drawn at the caption's 16 points, cropped to its
// own artwork so the garment itself is that tall. "Easier to see" draws it at 24 (O13).
const ACCESSORY_CAPTION_SIZE = 16;

function useAccessoryDrawingSize(): number {
  const { controlScale } = useTextScaling();
  return (useEasierToSee() ? easierToSeeValues.accessoryDrawingSize : ACCESSORY_CAPTION_SIZE) * controlScale;
}

/** The lines read with the outfit, directly under its board. */
export function TodayOutfitNotes({
  copy,
  presentation,
  primary,
  stageColor,
  updating,
  updatingDayType,
}: Readonly<{
  copy: TodayCopy;
  presentation: LoadedTodayPresentation;
  primary: LoadedOutfitPresentation;
  stageColor: string;
  updating: boolean;
  updatingDayType: DressStyle | null;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  const choosing = presentation.choosingCaption;
  return (
    <ArrivesAfterHandoff index={4}>
      {/* N18 and N15: the outfit's claim sits directly under the board, where it is read
          with the outfit, never beside the button. While a re-ask runs, its window
          replaces the claim and says why the outfit is dimmed; each hand-off crossfades. */}
      <Crossfade
        contentKey={choosing ? `choosing:${choosing}` : `claim:${presentation.coverageCaption ?? ''}`}>
        {choosing ? (
          <View style={styles.captionRow}>
            <PhaseMark size={16} testID="today-choosing-mark" />
            <AppText
              accessibilityLiveRegion="polite"
              colorRole="textSecondary"
              style={styles.captionText}
              tabularNumbers
              testID="today-choosing-caption"
              variant="caption">
              {choosing}
            </AppText>
          </View>
        ) : presentation.coverageCaption ? (
          <View accessible style={styles.captionRow} testID="today-coverage-caption">
            <Icon color={theme.colors.iconSecondary} name="clock" size={16 * controlScale} />
            <AppText colorRole="textSecondary" style={styles.captionText} tabularNumbers variant="caption">
              {presentation.coverageCaption}
            </AppText>
          </View>
        ) : null}
      </Crossfade>
      {/* Law 4: a status is ink, glyph and text together. */}
      {presentation.driftCaption ? (
        <View accessible style={styles.captionRow} testID="today-drift-caption">
          <Icon color={theme.colors.warningInk} name="warning" size={16 * controlScale} />
          <AppText colorRole="warningInk" style={styles.captionText} tabularNumbers variant="caption">
            {presentation.driftCaption}
          </AppText>
        </View>
      ) : null}
      {/* f7: a morning or evening answer is regenerating the outfit; this line says why
          it is dimmed, and it stays until the new outfit lands. */}
      {updatingDayType && !choosing ? (
        <View style={styles.updatingRow}>
          <PhaseMark size={16} testID="today-updating-mark" />
          <AppText
            accessibilityLiveRegion="polite"
            colorRole="textSecondary"
            style={styles.updatingText}
            testID="today-updating-status"
            variant="caption">
            {copy.dailyStyle.updating[updatingDayType]}
          </AppText>
        </View>
      ) : null}
      {presentation.dayInsight ? (
        <Dimmed dimmed={updating} style={styles.insight}>
          <Crossfade contentKey={presentation.dayInsight}>
            <AppText testID="today-day-insight" variant="body">{presentation.dayInsight}</AppText>
          </Crossfade>
        </Dimmed>
      ) : null}
      {primary.accessories.length > 0 || presentation.coolSpellCaption ? (
        <View style={styles.finishingTouches}>
          <AccessoryCaption
            caption={presentation.copy.finishingTouchesHeading}
            stageColor={stageColor}
            suggestion={primary}
          />
          {presentation.coolSpellCaption ? (
            <CoolSpellLine caption={presentation.coolSpellCaption} />
          ) : null}
        </View>
      ) : null}
    </ArrivesAfterHandoff>
  );
}

/**
 * The accessories the outfit finishes with: the caption, then each drawing at the caption's
 * size (Law 6), cropped to its own artwork with the stroke scaled to it (M21), in the colours
 * the outfit's palette gave it with the board (O15). One accessible element reads the names,
 * never animated. A day that asks for no accessory renders nothing at all.
 */
function AccessoryCaption({
  caption,
  stageColor,
  suggestion,
}: Readonly<{ caption: string; stageColor: string; suggestion: LoadedOutfitPresentation }>) {
  const drawingSize = useAccessoryDrawingSize();
  // The board's own resolution, read back from the palette memo: accessories stand on the
  // page ground, which the palette already measures them against.
  const roles = useGarmentRoles(suggestion.palette, stageColor);
  if (suggestion.accessories.length === 0) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={suggestion.accessoriesAccessibilityLabel}
      style={styles.accessoryCaption}
      testID="today-accessory-badges">
      <AppText colorRole="textSecondary" variant="caption">
        {caption}
      </AppText>
      <DarkPlate style={styles.accessoryPlate}>
        <View style={styles.accessoryGlyphs}>
          {suggestion.accessories.map((accessory) => (
            <GarmentDrawing
              category={accessory.category}
              garmentTypeId={accessory.garmentTypeId}
              key={accessory.accessorySlot}
              roles={roles.get(accessory.accessorySlot)}
              size={drawingSize}
              testID={`today-accessory-${accessory.garmentTypeId}`}
            />
          ))}
        </View>
      </DarkPlate>
    </View>
  );
}

// N19: a later short cool spell is one finishing-touch line, led by the cardigan
// silhouette at caption size (law 6), so the layer it asks for is named and drawn.
function CoolSpellLine({ caption }: Readonly<{ caption: string }>) {
  const drawingSize = useAccessoryDrawingSize();
  return (
    <View accessible accessibilityLabel={caption} style={styles.coolSpell} testID="today-cool-spell">
      <DarkPlate style={styles.accessoryPlate}>
        <GarmentDrawing
          category="top"
          garmentTypeId="cardigan"
          size={drawingSize}
          testID="today-cool-spell-cardigan"
        />
      </DarkPlate>
      <AppText colorRole="textSecondary" style={styles.captionText} tabularNumbers variant="caption">
        {caption}
      </AppText>
    </View>
  );
}

/**
 * O5: "Last updated" sits under the finishing touches; it no longer describes a button.
 * Each new line crossfades, and the mark arrives and leaves with its own line, so it
 * never pushes a line that is already showing.
 */
export function TodayFreshness({
  header,
  usesAccessibilityLayout,
}: Readonly<{ header: LoadedTodayPresentation['header']; usesAccessibilityLayout: boolean }>) {
  return (
    <ArrivesAfterHandoff index={5}>
      <Crossfade contentKey={header.freshness} style={styles.provenanceSlot} testID="today-provenance">
        <View style={[styles.provenance, usesAccessibilityLayout && styles.stackedProvenance]}>
          {header.phase ? <PhaseMark size={16} testID="today-phase-mark" /> : null}
          <AppText
            accessibilityLiveRegion={header.announceFreshness ? 'polite' : 'none'}
            colorRole="textSecondary"
            style={[styles.freshness, usesAccessibilityLayout && styles.stackedFreshness]}
            tabularNumbers
            testID="today-freshness"
            variant="caption">
            {header.freshness}
          </AppText>
        </View>
      </Crossfade>
    </ArrivesAfterHandoff>
  );
}

const styles = StyleSheet.create({
  captionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  captionText: { flexShrink: 1 },
  updatingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  updatingText: { flexShrink: 1 },
  insight: { marginTop: spacing.xl },
  finishingTouches: { gap: spacing.sm, marginTop: spacing.md },
  accessoryCaption: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap',
    rowGap: spacing.xs },
  coolSpell: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  accessoryGlyphs: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  // The dark appearance's plate behind the finishing touches: a small tile, never a card.
  accessoryPlate: { borderRadius: radii.control, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  provenanceSlot: { marginTop: spacing.sm },
  provenance: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stackedProvenance: { alignItems: 'flex-start', flexDirection: 'column' },
  freshness: { flexShrink: 1 },
  stackedFreshness: { width: '100%' },
});
