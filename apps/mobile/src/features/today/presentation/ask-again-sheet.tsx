import type { DressStyle } from '@kuyara/contracts';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  GlassButton,
  NativeSheet,
  NativeWheelPicker,
  SegmentedControl,
} from '@/components/ui';
import { outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import { DayTypeTiles } from '@/features/today/presentation/daily-formality-sheet';
import { askAgainWarning, formatDepartureTime } from '@/features/today/presentation/today-presentation';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { spacing } from '@/theme/theme';

const quarterHourMs = 15 * 60 * 1000;
// Settled with the owner: a 15-minute wheel over the next 12 hours; the forecast is hourly.
const horizonMs = 12 * 60 * 60 * 1000;
// The wheel opens about an hour ahead, the nearest departure worth planning for.
const defaultLeadMs = 60 * 60 * 1000;

export type AskAgainChoice = Readonly<{ formality: DressStyle; departureAt: string | null }>;

/** The quarter hours after `now` and within the horizon, as ISO instants. */
export function departureOptions(now: number): readonly string[] {
  const first = Math.floor(now / quarterHourMs) * quarterHourMs + quarterHourMs;
  const options: string[] = [];
  for (let at = first; at <= now + horizonMs; at += quarterHourMs) {
    options.push(new Date(at).toISOString());
  }
  return options;
}

type Draft = Readonly<{
  formality: DressStyle;
  mode: 'now' | 'later';
  departureAt: string;
  options: readonly string[];
}>;

function openDraft(selected: DressStyle, now: number, departure: string | null): Draft {
  const options = departureOptions(now);
  // A persisted Later departure that is still ahead reopens as Later at that time; a past
  // or absent one, or one the wheel does not offer, opens on Now.
  const persisted = departure === null ? undefined
    : options.find((option) => Date.parse(option) === Date.parse(departure));
  return {
    formality: selected,
    mode: persisted ? 'later' : 'now',
    departureAt: persisted ?? options.find((option) => Date.parse(option) >= now + defaultLeadMs)
      ?? options[options.length - 1] ?? new Date(now).toISOString(),
    options,
  };
}

/**
 * "Ask the stylist again" (O3): one sheet, no system alert. The day type with the current
 * answer checked, Now | Later with a 15-minute wheel for Later, the warning sentence for the
 * window the new outfit will cover, and one prominent confirmation whose label names the
 * time. Cancel keeps the outfit; the caller decides what a confirmation does.
 */
export function AskAgainSheet({
  visible, language, hour12, now, timeZone, selected, departure = null, evening, busy, error, onConfirm,
  onDismiss,
}: Readonly<{
  visible: boolean;
  language: SupportedLanguage;
  hour12: boolean;
  /** The clock the sheet opened on; the wheel and the window are read against it. */
  now: number;
  /** The place's zone, the one the coverage window and the wheel's clock times use. */
  timeZone: string;
  /** The day type in force, checked when the sheet opens. */
  selected: DressStyle;
  /** The dressing day's persisted Later departure, if any; the sheet reopens on it. */
  departure?: string | null;
  /** The evening half of the dressing day words the question for the evening. */
  evening: boolean;
  busy: boolean;
  error: boolean;
  onConfirm: (choice: AskAgainChoice) => void;
  onDismiss: () => void;
}>) {
  const messages = getMessages(language).today;
  const copy = messages.askAgain;
  const [draft, setDraft] = useState(() => openDraft(selected, now, departure));
  const [wasVisible, setWasVisible] = useState(visible);
  // Every opening starts from the answer in force and the persisted departure (Now when
  // none is ahead), never from the last draft.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(openDraft(selected, now, departure));
  }
  const start = draft.mode === 'now' ? new Date(now).toISOString() : draft.departureAt;
  const coverage = outfitCoverage(start, timeZone);
  const time = (value: string) => formatDepartureTime(value, language, hour12, timeZone);

  return (
    <NativeSheet onDismiss={onDismiss} size="large" testID="ask-again-sheet" visible={visible}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <AppText accessibilityRole="header" style={styles.question} variant="title">
            {evening ? messages.dailyStyle.questionEvening : messages.dailyStyle.question}
          </AppText>
          <GlassButton kind="close" label={messages.dailyStyle.close} onPress={onDismiss} testID="ask-again-close" />
        </View>
        <DayTypeTiles
          language={language}
          onSelect={(formality) => setDraft((current) => ({ ...current, formality }))}
          selected={draft.formality}
          testID="ask-again-day-type"
        />
        <AppText accessibilityRole="header" style={styles.when} variant="bodyStrong">
          {copy.whenQuestion}
        </AppText>
        <SegmentedControl
          onChange={(mode) => setDraft((current) => ({ ...current, mode }))}
          options={[{ value: 'now', label: copy.now }, { value: 'later', label: copy.later }]}
          testID="ask-again-when"
          value={draft.mode}
        />
        {draft.mode === 'later' ? (
          <NativeWheelPicker
            onSelectionChange={(departureAt) => setDraft((current) => ({ ...current, departureAt }))}
            options={draft.options.map((value) => ({ value, label: time(value) }))}
            selection={draft.departureAt}
            testID="ask-again-departure"
          />
        ) : null}
        {coverage ? (
          <AppText colorRole="textSecondary" tabularNumbers testID="ask-again-warning">
            {askAgainWarning(coverage, now, timeZone, language, hour12)}
          </AppText>
        ) : null}
        {error ? (
          <AppText accessibilityRole="alert" colorRole="warningInk" testID="ask-again-error">
            {messages.dailyStyle.saveError}
          </AppText>
        ) : null}
        <Button
          label={draft.mode === 'now' ? copy.chooseNow : copy.chooseAt(time(draft.departureAt))}
          loading={busy}
          onPress={() => onConfirm({
            formality: draft.formality,
            departureAt: draft.mode === 'now' ? null : draft.departureAt,
          })}
          size="large"
          testID="ask-again-confirm"
          variant="prominent"
        />
      </ScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  question: { flex: 1, fontWeight: '600', marginTop: spacing.xs },
  when: { marginTop: spacing.sm },
});
