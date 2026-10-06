import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Entrance, Screen, useTextScaling } from '@/components/ui';
import {
  GarmentBoard,
  measureGarmentBoardHeight,
  type GarmentBoardPiece,
  type GarmentOutfitPalette,
} from '@/garment-art';
import { EmptyStateArt } from '@/components/ui/empty-state-art';
import { calendarDateUtcMidnight } from '@/domain/calendar-date';
import { dateTimeFormat } from '@/domain/intl-format';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { historyDrawingSky } from '@/features/profile/presentation/history-drawing-sky';
import { HistoryWeekSummary } from '@/features/profile/presentation/history-week-summary';
import { archetypeLabel } from '@/features/recommendation/application/recommendation-application-controller';
import { outfitSlots } from '@/features/recommendation/domain/outfit-composition';
import { dateKeyDayKind } from '@/features/recommendation/domain/local-day';
import { historyDays, type WornOutfit, type WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import type { WeekSummary } from '@/features/recommendation/domain/outfit-history-week';
import { localeTag } from '@/localization/locale-tag';
import type { AppMessages } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { useEasierToSee } from '@/theme/easier-to-see';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** One worn look; a day can hold several, worn at different times. */
export type HistoryEntry = Readonly<{
  id: string; dayKey: string; wornAt: string; outfit: WornOutfit; pieceColors: WornPieceColors | null;
}>;

type HistoryScreenProps = Readonly<{
  /** Newest date first, a date's looks morning first; null while the first read is running. */
  entries: readonly HistoryEntry[] | null;
  loadFailed: boolean;
  /** Sunday evening's look back at the week, above the days; null at any other time. */
  weekSummary?: WeekSummary | null;
  /** False while the push onto History is still moving: the content arrives once it lands. */
  transitionLanded?: boolean;
  /** An empty History's button: Today is where a look is marked worn. */
  onOpenToday?: () => void;
  /** A failed first read's Try again. */
  onRetry?: () => void;
}>;

// An empty History shows a plain worn look, faded, over its sentence, as the Closet's empty
// category shows its own piece.
const EMPTY_BOARD_WIDTH = 160;
// Only the rows of the first screenful arrive with Law 7's stagger; a row scrolled into view
// later is simply there.
const ARRIVING_ROWS = 6;

/** A look as History draws it: `key` is its day, then `-2`, `-3` for a day's later looks. */
type DayLook = Readonly<{ key: string; entry: HistoryEntry }>;

type HistoryRow =
  | Readonly<{ kind: 'month'; key: string; label: string }>
  | Readonly<{ kind: 'latest'; key: string; dayKey: string; looks: readonly DayLook[] }>
  // Earlier days worn once, side by side.
  | Readonly<{ kind: 'days'; key: string; looks: readonly DayLook[] }>
  // An earlier day worn more than once: its date once, then its looks.
  | Readonly<{ kind: 'day'; key: string; dayKey: string; looks: readonly DayLook[] }>;

type HistoryBoard = Readonly<{ pieces: readonly GarmentBoardPiece[]; palette: GarmentOutfitPalette }>;

// A worn day is drawn in the swatches its pieces had on outfit detail. A day recorded
// without them (before migration 24) is drawn in the pieces' natural colourways for a mild
// day, the same every time. One object per entry lets the board skip composing again on a
// re-render; the entry, not its outfit, is the key, because the colours belong to it. The
// look key names the drawing, so a day's first look is drawn as its one record always was.
type BoardEntry = Pick<HistoryEntry, 'dayKey' | 'outfit' | 'pieceColors'>;
const boards = new WeakMap<BoardEntry, HistoryBoard>();
export function historyBoard(entry: BoardEntry, lookKey = entry.dayKey): HistoryBoard {
  const kept = boards.get(entry);
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
      optionId: `history-${lookKey}`,
      ...historyDrawingSky,
      formality,
      pieces: outfitSlots.flatMap((slot) => {
        const id = garments[slot];
        return id ? [{ slot, garmentTypeId: id, recordedSwatchId: entry.pieceColors?.[slot] }] : [];
      }),
    },
  };
  boards.set(entry, board);
  return board;
}

const EMPTY_BOARD = historyBoard({
  dayKey: '2000-01-01',
  outfit: {
    garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
    archetypeId: 'everyday_easy',
    formality: 'casual',
    source: 'recommended',
  },
  pieceColors: null,
});

/**
 * Newest first: the latest day on its own, then each month's days, those worn once in rows of
 * `columns` and a day worn more than once on rows of its own. A day's looks run morning first.
 */
function historyRows(
  entries: readonly HistoryEntry[],
  columns: number,
  monthLabel: (date: Date) => string,
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let month = '';
  let pending: DayLook[] = [];
  const flush = () => {
    if (pending.length) rows.push({ kind: 'days', key: `days-${pending[0].key}`, looks: pending });
    pending = [];
  };
  historyDays(entries).forEach(({ dayKey, looks: dayLooks }, index) => {
    const dayMonth = dayKey.slice(0, 7);
    if (dayMonth !== month) {
      flush();
      month = dayMonth;
      rows.push({ kind: 'month', key: `month-${dayMonth}`, label: monthLabel(calendarDateUtcMidnight(dayKey)) });
    }
    const looks = dayLooks.map((entry, look) => ({ key: look === 0 ? dayKey : `${dayKey}-${look + 1}`, entry }));
    if (index === 0) {
      rows.push({ kind: 'latest', key: `latest-${dayKey}`, dayKey, looks });
      return;
    }
    if (looks.length > 1) {
      flush();
      rows.push({ kind: 'day', key: `day-${dayKey}`, dayKey, looks });
      return;
    }
    pending.push(looks[0]);
    if (pending.length === columns) flush();
  });
  flush();
  return rows;
}

function dayCopy(entry: BoardEntry, messages: AppMessages) {
  return {
    title: archetypeLabel(messages.recommendation, entry.outfit.archetypeId, dateKeyDayKind(entry.dayKey)),
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
 * stands large; earlier days follow under their month, newest first. A day worn more than once
 * shows its date once and its looks under it, morning first. No streak, count or
 * penalty, and a day is a record to look at, not a control. Law 7: the first screenful arrives
 * in reading order once the push has landed, and a refocus re-read brings in only a day that
 * is new.
 */
export function HistoryScreen({
  entries, loadFailed, weekSummary = null, transitionLanded = true, onOpenToday, onRetry,
}: HistoryScreenProps) {
  const { language, messages } = useLocalization();
  const theme = useKuyaraTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { usesStackedLayout } = useTextScaling();
  const easierToSee = useEasierToSee();
  const copy = messages.profile;
  const formats = useMemo(() => {
    // A day key is a calendar date in no zone, so it is read as UTC midnight and formatted in UTC;
    // the explicit zone is also what lets the formatters come from the cache.
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
  // The looks the previous read showed, null until a read has landed before this one: the
  // first read's screenful arrives, a later read brings in only looks that are new.
  const [shown, setShown] = useState<Readonly<{
    entries: readonly HistoryEntry[] | null; before: ReadonlySet<string> | null;
  }>>({ entries: null, before: null });
  if (entries !== shown.entries) {
    setShown({
      entries,
      before: shown.entries ? new Set(shown.entries.map(({ id }) => id)) : shown.before,
    });
  }
  const { before } = shown;

  if (loadFailed && entries === null) {
    // A failed re-read on refocus keeps the days already loaded; the error replaces the
    // screen only when there is nothing to show.
    return (
      <Screen testID="history-screen">
        <View style={styles.error}>
          <AppText accessibilityRole="alert" colorRole="textSecondary" testID="history-error">
            {copy.historyLoadError}
          </AppText>
          {onRetry ? (
            <Button label={copy.historyRetryAction} onPress={() => onRetry()} testID="history-retry-button" />
          ) : null}
        </View>
      </Screen>
    );
  }
  if (entries === null) return <Screen testID="history-screen">{null}</Screen>;
  if (entries.length === 0) {
    return (
      <Screen testID="history-screen">
        <Entrance waiting={!transitionLanded}>
          <View style={styles.empty} testID="history-empty">
            <EmptyStateArt testID="history-empty-art">
              <GarmentBoard
                accessibilityLabel=""
                decorative
                palette={EMPTY_BOARD.palette}
                pieces={EMPTY_BOARD.pieces}
                preset="today"
                stageColor={theme.colors.surfaceMuted}
                width={EMPTY_BOARD_WIDTH}
              />
            </EmptyStateArt>
            <AppText style={styles.centered}>{copy.historyEmptyBody}</AppText>
            {onOpenToday ? (
              // Calm, as the Closet's empty button is.
              <Button label={copy.historyEmptyAction} onPress={onOpenToday} testID="history-empty-today-button"
                variant="tonal" />
            ) : null}
          </View>
        </Entrance>
      </Screen>
    );
  }

  const contentWidth = windowWidth - insets.left - insets.right - spacing.lg * 2;
  const tileWidth = (contentWidth - spacing.md * (columns - 1)) / columns;
  const arrivalIndex = (id: string | null, rowIndex: number, offset: number) => {
    if (!before) return rowIndex < ARRIVING_ROWS ? rowIndex + offset + 1 : null;
    if (id === null) return null;
    return before.has(id) ? null : 0;
  };

  const stage = ({ entry, key }: DayLook, width: number, height: number) => {
    const board = historyBoard(entry, key);
    return (
      <PlateView
        color={theme.colors.garmentTile}
        style={[styles.stage, { height, width }]}
        testID={`history-entry-board-${key}`}>
        <GarmentBoard
          accessibilityLabel=""
          decorative
          palette={board.palette}
          pieces={board.pieces}
          preset="today"
          stageColor={theme.colors.garmentTile}
          width={width}
        />
      </PlateView>
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
          {weekSummary ? <HistoryWeekSummary summary={weekSummary} /> : null}
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
          const fullDate = formats.full.format(calendarDateUtcMidnight(row.dayKey));
          const several = row.looks.length > 1;
          return (
            <View style={styles.latestDay}>
              {several ? (
                <Arrival index={arrivalIndex(null, rowIndex, 0)} waiting={!transitionLanded}>
                  <AppText accessibilityRole="header" testID={`history-day-${row.dayKey}`} variant="title">
                    {fullDate}
                  </AppText>
                </Arrival>
              ) : null}
              {row.looks.map((look, offset) => {
                const { style, title } = dayCopy(look.entry, messages);
                return (
                  <Arrival index={arrivalIndex(look.entry.id, rowIndex, offset + Number(several))}
                    key={look.key} waiting={!transitionLanded}>
                    <View
                      accessibilityLabel={`${fullDate}. ${title}. ${style}`}
                      accessible
                      style={styles.latest}
                      testID={`history-entry-${look.key}`}>
                      {stage(look, contentWidth, measureGarmentBoardHeight(
                        historyBoard(look.entry, look.key).pieces, contentWidth, 'today', false, easierToSee))}
                      <View style={styles.text}>
                        {several ? null : <AppText variant="title">{fullDate}</AppText>}
                        <AppText colorRole="textSecondary">{title}</AppText>
                        <AppText colorRole="textSecondary" variant="caption">{style}</AppText>
                      </View>
                    </View>
                  </Arrival>
                );
              })}
            </View>
          );
        }
        // Looks side by side share the taller stage, so their captions sit on one line.
        const height = Math.max(...row.looks.map(({ entry, key }) =>
          measureGarmentBoardHeight(historyBoard(entry, key).pieces, tileWidth, 'today', false, easierToSee)));
        const tiles = row.looks.map((look, offset) => {
          const date = calendarDateUtcMidnight(look.entry.dayKey);
          const { style, title } = dayCopy(look.entry, messages);
          return (
            <Arrival index={arrivalIndex(look.entry.id, rowIndex, offset + Number(row.kind === 'day'))}
              key={look.key} waiting={!transitionLanded}>
              <View
                accessibilityLabel={`${formats.full.format(date)}. ${title}. ${style}`}
                accessible
                style={[styles.day, { width: tileWidth }]}
                testID={`history-entry-${look.key}`}>
                {stage(look, tileWidth, height)}
                {/* A day worn more than once names its date once, above its looks. */}
                {row.kind === 'days' ? (
                  <AppText tabularNumbers variant="label">{formats.short.format(date)}</AppText>
                ) : null}
                <AppText colorRole="textSecondary" numberOfLines={usesStackedLayout ? 3 : 2}
                  variant="caption">
                  {title}
                </AppText>
              </View>
            </Arrival>
          );
        });
        if (row.kind === 'days') return <View style={styles.days}>{tiles}</View>;
        return (
          <View style={styles.text}>
            <Arrival index={arrivalIndex(null, rowIndex, 0)} waiting={!transitionLanded}>
              <AppText accessibilityRole="header" tabularNumbers testID={`history-day-${row.dayKey}`}
                variant="label">
                {formats.short.format(calendarDateUtcMidnight(row.dayKey))}
              </AppText>
            </Arrival>
            <View style={[styles.days, styles.wrap]}>{tiles}</View>
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
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  error: { alignItems: 'flex-start', gap: spacing.md },
  centered: { textAlign: 'center' },
  month: { paddingTop: spacing.md },
  latestDay: { gap: spacing.md },
  latest: { gap: spacing.sm },
  stage: { borderRadius: radii.imageTile, justifyContent: 'center', overflow: 'hidden' },
  text: { gap: spacing.xs },
  days: { flexDirection: 'row', gap: spacing.md },
  wrap: { flexWrap: 'wrap' },
  day: { gap: spacing.xs },
});
