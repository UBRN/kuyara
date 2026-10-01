import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Entrance,
  GarmentBoard,
  Icon,
  measureGarmentBoardHeight,
  Screen,
  useTextScaling,
  type GarmentBoardPiece,
  type GarmentOutfitPalette,
} from '@/components/ui';
import { dateTimeFormat } from '@/domain/intl-format';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { archetypeLabel } from '@/features/recommendation/application/recommendation-application-controller';
import { accessoryOutfitSlots, outfitSlots } from '@/features/recommendation/domain/outfit-composition';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import { localeTag } from '@/localization/locale-tag';
import type { AppMessages } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type HistoryEntry = Readonly<{ dayKey: string; outfit: WornOutfit }>;

type HistoryScreenProps = Readonly<{
  /** Newest first; null while the first read is running. */
  entries: readonly HistoryEntry[] | null;
  loadFailed: boolean;
  /** False while the push onto History is still moving: the content arrives once it lands. */
  transitionLanded?: boolean;
}>;

// The image-tile radius the Closet grid and Today's alternates draw (ADR 0029 section 2).
const TILE_RADIUS = 14;
// Law 6: a standalone glyph over the empty sentence, as the Closet's empty category has.
const EMPTY_GLYPH_SIZE = 44;
// Only the rows of the first screenful arrive with Law 7's stagger; a row scrolled into view
// later is simply there.
const ARRIVING_ROWS = 6;

type HistoryRow =
  | Readonly<{ kind: 'month'; key: string; label: string }>
  | Readonly<{ kind: 'latest'; key: string; entry: HistoryEntry }>
  | Readonly<{ kind: 'days'; key: string; entries: readonly HistoryEntry[] }>;

type HistoryBoard = Readonly<{ pieces: readonly GarmentBoardPiece[]; palette: GarmentOutfitPalette }>;

// A bare date is a calendar day, not an instant: read it at noon UTC and format it in UTC,
// so no time zone can move it to the day before.
const dayDate = (dayKey: string) => new Date(`${dayKey}T12:00:00.000Z`);

// A worn day keeps its catalog types by slot and no colours, so its board is drawn in the
// pieces' natural colourways for a mild day, the same every time the day is drawn. One
// object per stored outfit lets the board skip composing again on a re-render.
const boards = new WeakMap<WornOutfit, HistoryBoard>();
function historyBoard(entry: HistoryEntry): HistoryBoard {
  const kept = boards.get(entry.outfit);
  if (kept) return kept;
  const { garments, formality } = entry.outfit;
  const pieces = outfitSlots.flatMap((slot) => {
    const id = garments[slot];
    const type = id ? getGarmentType(id) : undefined;
    return id && type ? [{ slot, garmentTypeId: type.typeId, category: type.structuralCategory }] : [];
  });
  const board: HistoryBoard = {
    pieces,
    palette: {
      optionId: `history-${entry.dayKey}`,
      temperatureC: 18,
      condition: 'cloudy',
      isNight: false,
      formality,
      pieces: [...outfitSlots, ...accessoryOutfitSlots].flatMap((slot) => {
        const id = garments[slot];
        return id ? [{ slot, garmentTypeId: id }] : [];
      }),
    },
  };
  boards.set(entry.outfit, board);
  return board;
}

/** Newest first: the latest day on its own, then each month's days in rows of `columns`. */
function historyRows(
  entries: readonly HistoryEntry[],
  columns: number,
  monthLabel: (date: Date) => string,
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let month = '';
  let pending: HistoryEntry[] = [];
  const flush = () => {
    if (pending.length) rows.push({ kind: 'days', key: `days-${pending[0].dayKey}`, entries: pending });
    pending = [];
  };
  entries.forEach((entry, index) => {
    const entryMonth = entry.dayKey.slice(0, 7);
    if (entryMonth !== month) {
      flush();
      month = entryMonth;
      rows.push({ kind: 'month', key: `month-${entryMonth}`, label: monthLabel(dayDate(entry.dayKey)) });
    }
    if (index === 0) {
      rows.push({ kind: 'latest', key: `latest-${entry.dayKey}`, entry });
      return;
    }
    pending.push(entry);
    if (pending.length === columns) flush();
  });
  flush();
  return rows;
}

function dayCopy(entry: HistoryEntry, messages: AppMessages) {
  const date = dayDate(entry.dayKey);
  const dayKind = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 'weekend' : 'weekday';
  return {
    date,
    title: archetypeLabel(messages.recommendation, entry.outfit.archetypeId, dayKind),
    style: messages.today.dailyStyle[entry.outfit.formality],
  };
}

/** Holds the entrance decision made at mount, so a later re-render never replays it. */
function Arrival({ children, index, waiting }: Readonly<{
  children: ReactNode; index: number | null; waiting: boolean;
}>) {
  const [mountedIndex] = useState(index);
  return mountedIndex === null ? children : <Entrance index={mountedIndex} waiting={waiting}>{children}</Entrance>;
}

/**
 * ADR 0038: the looks the reader chose to wear, as a diary of small boards. The latest day
 * stands large; earlier days follow under their month, newest first. No streak, count or
 * penalty, and a day is a record to look at, not a control. Law 7: the first screenful arrives
 * in reading order once the push has landed, and a refocus re-read brings in only a day that
 * is new.
 */
export function HistoryScreen({ entries, loadFailed, transitionLanded = true }: HistoryScreenProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { usesStackedLayout } = useTextScaling();
  const copy = messages.profile;
  const formats = useMemo(() => {
    const tag = localeTag(language);
    return {
      full: dateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
      short: dateTimeFormat(tag, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
      month: dateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
  }, [language]);
  const columns = usesStackedLayout ? 1 : 2;
  const rows = useMemo(
    () => (entries ? historyRows(entries, columns, (date) => formats.month.format(date)) : []),
    [columns, entries, formats],
  );
  // The days the previous read showed, null until a read has landed before this one: the
  // first read's screenful arrives, a later read brings in only days that are new.
  const [shown, setShown] = useState<Readonly<{
    entries: readonly HistoryEntry[] | null; before: ReadonlySet<string> | null;
  }>>({ entries: null, before: null });
  if (entries !== shown.entries) {
    setShown({
      entries,
      before: shown.entries ? new Set(shown.entries.map(({ dayKey }) => dayKey)) : shown.before,
    });
  }
  const { before } = shown;

  if (loadFailed && entries === null) {
    // A failed re-read on refocus keeps the days already loaded; the error replaces the
    // screen only when there is nothing to show.
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
        <Entrance waiting={!transitionLanded}>
          <View style={styles.empty} testID="history-empty">
            <Icon color={theme.colors.iconSecondary} name="calendarCheck" size={EMPTY_GLYPH_SIZE} />
            <AppText accessibilityRole="header" style={styles.centered} variant="title">
              {copy.historyEmptyTitle}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centered}>{copy.historyEmptyBody}</AppText>
          </View>
        </Entrance>
      </Screen>
    );
  }

  const contentWidth = windowWidth - insets.left - insets.right - spacing.lg * 2;
  const tileWidth = (contentWidth - spacing.md * (columns - 1)) / columns;
  const arrivalIndex = (dayKey: string | null, rowIndex: number, offset: number) => {
    if (!before) return rowIndex < ARRIVING_ROWS ? rowIndex + offset + 1 : null;
    if (dayKey === null) return null;
    return before.has(dayKey) ? null : 0;
  };

  const stage = (entry: HistoryEntry, width: number, height: number) => {
    const board = historyBoard(entry);
    return (
      <View
        style={[styles.stage, { backgroundColor: theme.colors.surfaceMuted, height, width }]}
        testID={`history-entry-board-${entry.dayKey}`}>
        <GarmentBoard
          accessibilityLabel=""
          decorative
          palette={board.palette}
          pieces={board.pieces}
          preset="today"
          stageColor={theme.colors.surfaceMuted}
          width={width}
        />
      </View>
    );
  };

  return (
    <FlatList<HistoryRow>
      accessibilityLabel={copy.historyLabel}
      contentContainerStyle={[styles.list, {
        paddingBottom: (Platform.OS === 'ios' ? 0 : insets.bottom) + spacing['2xl'],
        paddingLeft: insets.left + spacing.lg,
        paddingRight: insets.right + spacing.lg,
      }]}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      initialNumToRender={8}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <Entrance waiting={!transitionLanded}>
          <AppText colorRole="textSecondary" variant="caption">{copy.historyIntro}</AppText>
        </Entrance>
      }
      renderItem={({ item: row, index: rowIndex }) => {
        if (row.kind === 'month') {
          return (
            <Arrival index={arrivalIndex(null, rowIndex, 0)} waiting={!transitionLanded}>
              <AppText accessibilityRole="header" colorRole="textSecondary" style={styles.month}
                testID={row.key} variant="bodyStrong">
                {row.label}
              </AppText>
            </Arrival>
          );
        }
        if (row.kind === 'latest') {
          const { entry } = row;
          const { date, style, title } = dayCopy(entry, messages);
          const fullDate = formats.full.format(date);
          return (
            <Arrival index={arrivalIndex(entry.dayKey, rowIndex, 0)} waiting={!transitionLanded}>
              <View
                accessibilityLabel={`${fullDate}. ${title}. ${style}`}
                accessible
                style={styles.latest}
                testID={`history-entry-${entry.dayKey}`}>
                {stage(entry, contentWidth,
                  measureGarmentBoardHeight(historyBoard(entry).pieces, contentWidth, 'today'))}
                <View style={styles.text}>
                  <AppText variant="title">{fullDate}</AppText>
                  <AppText colorRole="textSecondary">{title}</AppText>
                  <AppText colorRole="textSecondary" variant="caption">{style}</AppText>
                </View>
              </View>
            </Arrival>
          );
        }
        // Two days side by side share the taller stage, so their dates sit on one line.
        const height = Math.max(...row.entries.map((entry) =>
          measureGarmentBoardHeight(historyBoard(entry).pieces, tileWidth, 'today')));
        return (
          <View style={styles.days}>
            {row.entries.map((entry, offset) => {
              const { date, style, title } = dayCopy(entry, messages);
              return (
                <Arrival index={arrivalIndex(entry.dayKey, rowIndex, offset)} key={entry.dayKey}
                  waiting={!transitionLanded}>
                  <View
                    accessibilityLabel={`${formats.full.format(date)}. ${title}. ${style}`}
                    accessible
                    style={[styles.day, { width: tileWidth }]}
                    testID={`history-entry-${entry.dayKey}`}>
                    {stage(entry, tileWidth, height)}
                    <AppText tabularNumbers variant="label">{formats.short.format(date)}</AppText>
                    <AppText colorRole="textSecondary" numberOfLines={usesStackedLayout ? 3 : 2}
                      variant="caption">
                      {title}
                    </AppText>
                  </View>
                </Arrival>
              );
            })}
          </View>
        );
      }}
      showsVerticalScrollIndicator={false}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      testID="history-screen"
      windowSize={7}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  centered: { textAlign: 'center' },
  month: { paddingTop: spacing.md },
  latest: { gap: spacing.sm },
  stage: { borderRadius: TILE_RADIUS, justifyContent: 'center', overflow: 'hidden' },
  text: { gap: spacing.xs },
  days: { flexDirection: 'row', gap: spacing.md },
  day: { gap: spacing.xs },
});
