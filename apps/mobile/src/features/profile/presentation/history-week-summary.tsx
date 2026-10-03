import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentDrawing,
  Icon,
  useGarmentRoles,
  type GarmentOutfitPalette,
  type IconName,
} from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { DressedFor, WeekSummary } from '@/features/recommendation/domain/outfit-history-week';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6: a glyph beside body text is 20.
const LINE_GLYPH_SIZE = 20;
// The piece stands on a small garment plate, drawn at the image-tile radius History's days use.
const PLATE_SIZE = 56;
const DRAWING_SIZE = 44;

const dressedForGlyph: Readonly<Record<DressedFor, IconName>> = {
  rain: 'dressedForRain',
  cold: 'dressedForCold',
  light: 'clothing',
};

function MostWornLine({ mostWorn }: Readonly<{ mostWorn: NonNullable<WeekSummary['mostWorn']> }>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const type = getGarmentType(mostWorn.garmentTypeId);
  // Drawn in the colour it came back in most, or its natural colourway for a mild day when
  // none of its days kept colours, as History draws such a day.
  const palette = useMemo<GarmentOutfitPalette>(() => ({
    optionId: `history-week-${mostWorn.garmentTypeId}`,
    temperatureC: 18,
    condition: 'cloudy',
    isNight: false,
    formality: type?.formality ?? 'casual',
    pieces: [{
      slot: mostWorn.slot,
      garmentTypeId: mostWorn.garmentTypeId,
      recordedSwatchId: mostWorn.swatchId ?? undefined,
    }],
  }), [mostWorn, type]);
  const roles = useGarmentRoles(palette, theme.colors.garmentTile);
  if (!type) return null;
  const line = messages.profile.historyWeekMostWorn({
    piece: messages.catalog[type.nameKey], count: mostWorn.days,
  });
  return (
    <View accessibilityLabel={line} accessible style={styles.line} testID="history-week-most-worn">
      <PlateView color={theme.colors.garmentTile} style={styles.plate}>
        <GarmentDrawing
          category={type.structuralCategory}
          garmentTypeId={type.typeId}
          roles={roles.get(mostWorn.slot)}
          size={DRAWING_SIZE}
          testID={`history-week-most-worn-${type.typeId}`}
        />
      </PlateView>
      <AppText style={styles.lineText} tabularNumbers>{line}</AppText>
    </View>
  );
}

/**
 * ADR 0038: on Sunday evening History opens with a calm look back at the week the reader
 * recorded: how many days, what they were dressed for, and the piece that came back most.
 * It counts only what was recorded; it sets no goal and names no missing day.
 */
export function HistoryWeekSummary({ summary }: Readonly<{ summary: WeekSummary }>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const copy = messages.profile;
  return (
    <View style={styles.week} testID="history-week">
      <AppText accessibilityRole="header" variant="bodyStrong">{copy.historyWeekTitle}</AppText>
      <AppText tabularNumbers testID="history-week-days">{copy.historyWeekDays(summary.days)}</AppText>
      {summary.dressedFor.map(({ kind, days }) => {
        const line = copy.historyWeekDressedFor[kind](days);
        return (
          <View accessibilityLabel={line} accessible key={kind} style={styles.line}
            testID={`history-week-${kind}`}>
            <Icon color={theme.colors.iconSecondary} name={dressedForGlyph[kind]} size={LINE_GLYPH_SIZE} />
            <AppText colorRole="textSecondary" style={styles.lineText} tabularNumbers>{line}</AppText>
          </View>
        );
      })}
      {summary.mostWorn ? <MostWornLine mostWorn={summary.mostWorn} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: spacing.sm, paddingTop: spacing.md },
  line: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  lineText: { flexShrink: 1 },
  plate: {
    alignItems: 'center',
    borderRadius: radii.imageTile,
    height: PLATE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: PLATE_SIZE,
  },
});
