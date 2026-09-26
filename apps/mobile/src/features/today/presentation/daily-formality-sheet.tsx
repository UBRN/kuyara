import type { DressStyle } from '@kuyara/contracts';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { AppText, Button, ChoiceTile, ChoiceTileGrid, GlassButton, NativeSheet } from '@/components/ui';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { spacing } from '@/theme/theme';

// The three day types, each with a shipped ADR 0025 drawing (M6): Casual the tee, Smart the
// shirt, Formal the blazer. They are pictures, never the only signal; the word is under each.
const choices = [
  { style: 'casual', garmentTypeId: 't_shirt', category: 'top' },
  { style: 'smart', garmentTypeId: 'shirt', category: 'top' },
  { style: 'formal', garmentTypeId: 'blazer', category: 'outerwear' },
] as const satisfies readonly Readonly<{ style: DressStyle; garmentTypeId: GarmentTypeId; category: string }>[];

/**
 * The three day-type tiles as one radio group (the shared `ChoiceTile`, O14, which onboarding's
 * dress-style step draws too). With nothing checked (the 18:00 evening sheet, N20) every tile
 * draws its resting state.
 */
export function DayTypeTiles({
  language, selected, onSelect, testID,
}: Readonly<{
  language: SupportedLanguage;
  selected: DressStyle | null;
  onSelect: (style: DressStyle) => void;
  testID: string;
}>) {
  const copy = getMessages(language).today.dailyStyle;
  return (
    <ChoiceTileGrid accessibilityRole="radiogroup" columns={3} testID={`${testID}-choices`}>
      {choices.map(({ style, garmentTypeId, category }) => (
        <ChoiceTile
          drawings={[{ category, garmentTypeId }]}
          key={style}
          label={copy[style]}
          onPress={() => onSelect(style)}
          role="radio"
          selected={style === selected}
          testID={`${testID}-${style}`}
        />
      ))}
    </ChoiceTileGrid>
  );
}

/**
 * The morning sheet and the 18:00 evening sheet. Step 1 asks the day type: one tap on a tile
 * chooses it. Step 2 (M18) offers the day's styles at the large detent (N7); its answer and
 * the day type are written together, once. Closing the sheet answers with what it holds:
 * the profile's dress style on step 1, the chosen day type on step 2. The evening sheet opens
 * with nothing checked, because the morning answer never carries into the evening (N20).
 */
export function DailyFormalitySheet({
  visible, language, question, selected, firstDay = false, onChoose, onDismiss, error,
  step = 'dayType', styles: styleOptions, onConfirmStyles, confirmLabel,
}: Readonly<{
  visible: boolean;
  language: SupportedLanguage;
  /** The whole question, already worded for the day it asks about. */
  question: string;
  /** The answer checked when the sheet opens, so one tap confirms it; null checks none. */
  selected: DressStyle | null;
  /** The day onboarding finished: the checked answer is the one given in setup. */
  firstDay?: boolean;
  onChoose: (style: DressStyle) => void;
  onDismiss: () => void;
  error: boolean;
  step?: 'dayType' | 'styles';
  /** The day's style options, composed by the route (they belong to the profile feature). */
  styles?: ReactNode;
  onConfirmStyles?: () => void;
  confirmLabel?: string;
}>) {
  const copy = getMessages(language).today.dailyStyle;
  const stylesStep = step === 'styles';
  return (
    <NativeSheet onDismiss={onDismiss} size={stylesStep ? 'large' : 'default'}
      testID="daily-formality-sheet" visible={visible}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <AppText accessibilityRole="header" style={styles.question} variant="title">
            {stylesStep ? copy.stylesQuestion : question}
          </AppText>
          <GlassButton
            kind="close"
            label={copy.close}
            onPress={onDismiss}
            testID="daily-formality-close"
          />
        </View>
        {stylesStep ? (
          <>
            <AppText colorRole="textSecondary" testID="daily-formality-styles-note" variant="caption">
              {copy.stylesNote}
            </AppText>
            {styleOptions}
            {onConfirmStyles && confirmLabel ? (
              <Button label={confirmLabel} onPress={onConfirmStyles} size="large"
                testID="daily-formality-styles-done" />
            ) : null}
          </>
        ) : (
          <>
            {firstDay ? (
              <AppText colorRole="textSecondary" testID="daily-formality-first-day" variant="caption">
                {copy.firstDayNote}
              </AppText>
            ) : null}
            <DayTypeTiles language={language} onSelect={onChoose} selected={selected} testID="daily-formality" />
          </>
        )}
        {error ? <AppText accessibilityRole="alert">{copy.saveError}</AppText> : null}
      </ScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  question: { flex: 1, fontWeight: '600', marginTop: spacing.xs },
});
