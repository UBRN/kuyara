import { StyleSheet, View } from 'react-native';

import { AppText, Entrance, GarmentTileArtwork, Screen } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { archetypeLabel } from '@/features/recommendation/application/recommendation-application-controller';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import { localeTag } from '@/localization/locale-tag';
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
 * entry's title is its date. No streak, count or penalty. Law 7: the content arrives in
 * reading order, and a refocus re-read brings in only an entry that is new.
 */
export function HistoryScreen({ entries, loadFailed }: HistoryScreenProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const copy = messages.profile;
  const dateFormat = new Intl.DateTimeFormat(localeTag(language), {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  // A failed re-read on refocus keeps the list already loaded; the error replaces the screen
  // only when there is nothing to show.
  if (loadFailed && entries === null) {
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
        <Entrance>
          <View style={styles.empty} testID="history-empty">
            <AppText accessibilityRole="header" style={styles.centered} variant="title">
              {copy.historyEmptyTitle}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centered}>{copy.historyEmptyBody}</AppText>
          </View>
        </Entrance>
      </Screen>
    );
  }

  return (
    <Screen testID="history-screen">
      <Entrance>
        <AppText colorRole="textSecondary" variant="caption">{copy.historyIntro}</AppText>
      </Entrance>
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
            <Entrance index={index + 1} key={dayKey}>
              <View
                accessible
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
            </Entrance>
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
