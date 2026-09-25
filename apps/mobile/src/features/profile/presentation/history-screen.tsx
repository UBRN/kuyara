import { StyleSheet, View } from 'react-native';

import { AppText, GarmentTileArtwork, Screen } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { archetypeLabel } from '@/features/recommendation/application/recommendation-application-controller';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import { localeTag } from '@/presentation/format-temperature';
import { useLocalization } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const TILE_SIZE = 64;

export type HistoryEntry = Readonly<{ dayKey: string; outfit: WornOutfit }>;

type HistoryScreenProps = Readonly<{
  /** Newest first; null while the first read is running. */
  entries: readonly HistoryEntry[] | null;
  loadFailed: boolean;
}>;

/**
 * ADR 0038: the looks the reader chose to wear, one per dressing day, newest first. Each
 * entry's title is its date. No streak, count or penalty.
 */
export function HistoryScreen({ entries, loadFailed }: HistoryScreenProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.profile;
  const dateFormat = new Intl.DateTimeFormat(localeTag(language), {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  if (loadFailed) {
    return (
      <Screen testID="history-screen">
        <AppText accessibilityRole="alert" colorRole="textSecondary" testID="history-error">
          {copy.historyLoadError}
        </AppText>
      </Screen>
    );
  }
  if (entries === null) return <Screen testID="history-screen">{null}</Screen>;
  if (entries.length === 0) {
    return (
      <Screen testID="history-screen">
        <View style={styles.empty} testID="history-empty">
          <AppText accessibilityRole="header" style={styles.centered} variant="title">
            {copy.historyEmptyTitle}
          </AppText>
          <AppText colorRole="textSecondary" style={styles.centered}>{copy.historyEmptyBody}</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="history-screen">
      <AppText colorRole="textSecondary" variant="caption">{copy.historyIntro}</AppText>
      <View testID="history-list">
        {entries.map(({ dayKey, outfit }, index) => {
          // A bare date is a calendar day, not an instant: read it at noon UTC and format it
          // in UTC, so no time zone can move it to the day before.
          const date = new Date(`${dayKey}T12:00:00.000Z`);
          const dayKind = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 'weekend' : 'weekday';
          const title = archetypeLabel(messages.recommendation, outfit.archetypeId, dayKind);
          const core = outfit.garments.one_piece ?? outfit.garments.primary_top;
          const coreType = core ? getGarmentType(core) : undefined;
          return (
            <View
              accessible
              key={dayKey}
              style={[styles.row, index > 0 && {
                borderTopColor: theme.colors.borderSubtle,
                borderTopWidth: StyleSheet.hairlineWidth,
              }]}
              testID={`history-entry-${dayKey}`}>
              <View style={[styles.tile, { backgroundColor: theme.colors.surfaceMuted }]}>
                {coreType ? (
                  <GarmentTileArtwork
                    category={coreType.structuralCategory}
                    colorFamily={null}
                    garmentTypeId={coreType.typeId}
                    glyphSize={TILE_SIZE * 0.6}
                    height={TILE_SIZE}
                    photoTestID={`history-entry-photo-${dayKey}`}
                    photoUri={null}
                    placeholderTestID={`history-entry-glyph-${dayKey}`}
                    silhouetteTestID={`history-entry-silhouette-${dayKey}`}
                    width={TILE_SIZE}
                  />
                ) : null}
              </View>
              <View style={styles.text}>
                <AppText variant="bodyStrong">{dateFormat.format(date)}</AppText>
                <AppText colorRole="textSecondary">{title}</AppText>
                <AppText colorRole="textSecondary" variant="caption">
                  {messages.today.dailyStyle[outfit.formality]}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { gap: spacing.sm, paddingTop: spacing.md },
  centered: { textAlign: 'center' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  tile: { alignItems: 'center', borderRadius: radii.control, height: TILE_SIZE, justifyContent: 'center',
    overflow: 'hidden', width: TILE_SIZE },
  text: { flex: 1, flexShrink: 1, gap: spacing.xs },
});
