import type { DressStyle } from '@kuyara/contracts';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { AppText, Button, ChoiceTile, ChoiceTileGrid, FadeIn, GlassButton, NativeSheet } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The three day types, each with a shipped ADR 0025 drawing (M6): Casual the tee, Smart the
// shirt, Formal the blazer. They are pictures, never the only signal; the word is under each.
const choices = [
  { style: 'casual', garmentTypeId: 't_shirt', category: 'top' },
  { style: 'smart', garmentTypeId: 'shirt', category: 'top' },
  { style: 'formal', garmentTypeId: 'blazer', category: 'outerwear' },
] as const satisfies readonly Readonly<{ style: DressStyle; garmentTypeId: GarmentTypeId; category: string }>[];

/**
 * The day-type tiles as one radio group (the shared `ChoiceTile`, O14, which onboarding's
 * dress-style step draws too). With nothing checked every tile draws its resting state.
 * `except` leaves one day type out: the day question offers it as its large usual answer.
 */
export function DayTypeTiles({
  language, selected, onSelect, testID, except,
}: Readonly<{
  language: SupportedLanguage;
  selected: DressStyle | null;
  onSelect: (style: DressStyle) => void;
  testID: string;
  except?: DressStyle;
}>) {
  const copy = getMessages(language).today.dailyStyle;
  const shown = choices.filter(({ style }) => style !== except);
  return (
    <ChoiceTileGrid accessibilityRole="radiogroup" columns={shown.length === 2 ? 2 : 3}
      testID={`${testID}-choices`}>
      {shown.map(({ style, garmentTypeId, category }) => (
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
 * A step's content after the step changed: it fades in on `normal` (a state change on the
 * open sheet, Law 7). The first step the sheet shows is drawn at rest.
 */
function StepFade({
  animate, children, style,
}: Readonly<{ animate: boolean; children: ReactNode; style: StyleProp<ViewStyle> }>) {
  const theme = useKuyaraTheme();
  return <FadeIn animate={animate} duration={theme.motion.normal} style={style}>{children}</FadeIn>;
}

/**
 * The morning sheet and the 18:00 evening sheet. Step 1 asks whether the day is the profile's
 * usual day type: the large button answers yes in one tap, and the other two day types below,
 * none checked, each answer in one tap too. The evening sheet asks the same about the profile's
 * day type and never carries the morning answer (N20). "Pick styles for today" opens step 2
 * (M18) at the large detent (N7): the three day types, the usual one checked, above the styles;
 * Done writes the day type and the styles together, once. A tile on that step only picks.
 * Closing the sheet answers with the usual day type on either step.
 */
export function DailyFormalitySheet({
  visible, language, period, usual, onChoose, onPickStyles, onDismiss, error,
  step = 'dayType', styles: styleOptions, stylesDayType, onStylesDayType, onConfirmStyles, confirmLabel,
}: Readonly<{
  visible: boolean;
  language: SupportedLanguage;
  /** Which dressing day the sheet asks about: the bare date or its `:evening` key. */
  period: 'morning' | 'evening';
  /** The profile's own day type, offered as the one-tap answer. */
  usual: DressStyle;
  onChoose: (style: DressStyle) => void;
  onPickStyles: () => void;
  onDismiss: () => void;
  error: boolean;
  step?: 'dayType' | 'styles';
  /** The day's style options, composed by the route (they belong to the profile feature). */
  styles?: ReactNode;
  /** The day type checked on the styles step, owned by the route until Done writes it. */
  stylesDayType?: DressStyle;
  onStylesDayType?: (style: DressStyle) => void;
  onConfirmStyles?: () => void;
  confirmLabel?: string;
}>) {
  const copy = getMessages(language).today.dailyStyle;
  const stylesStep = step === 'styles';
  // Each step change mounts the step's title and content afresh, so they fade in together.
  const [stepSwap, setStepSwap] = useState({ step, changes: 0 });
  if (stepSwap.step !== step) setStepSwap({ step, changes: stepSwap.changes + 1 });
  const stepFades = stepSwap.changes > 0;
  useErrorAnnouncement(visible && error ? copy.saveError : null);
  // Drawn as the re-ask sheet draws it: above the confirmation, so on the long styles step a
  // failed save is not left below the fold under Done.
  const errorLine = error ? (
    <AppText accessibilityRole="alert" colorRole="warningInk" testID="daily-formality-error">
      {copy.saveError}
    </AppText>
  ) : null;
  return (
    <NativeSheet onDismiss={onDismiss} size={stylesStep ? 'large' : 'default'}
      testID="daily-formality-sheet" visible={visible}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <StepFade animate={stepFades} key={`question-${stepSwap.changes}`} style={styles.questionSlot}>
            <AppText accessibilityRole="header" style={styles.question} variant="title">
              {stylesStep ? copy.stylesQuestion
                : (period === 'evening' ? copy.usualQuestionEvening : copy.usualQuestion)[usual]}
            </AppText>
          </StepFade>
          <GlassButton
            kind="close"
            label={copy.close}
            onPress={onDismiss}
            testID="daily-formality-close"
          />
        </View>
        <StepFade animate={stepFades} key={`step-${stepSwap.changes}`} style={styles.step}>
          {stylesStep ? (
            <>
              {onStylesDayType ? (
                <View style={styles.different}>
                  <AppText colorRole="textSecondary" testID="daily-formality-styles-day-type" variant="caption">
                    {period === 'evening' ? copy.questionEvening : copy.question}
                  </AppText>
                  <DayTypeTiles language={language} onSelect={onStylesDayType}
                    selected={stylesDayType ?? usual} testID="daily-formality-day-type" />
                </View>
              ) : null}
              <AppText colorRole="textSecondary" testID="daily-formality-styles-note" variant="caption">
                {copy.stylesNote}
              </AppText>
              {styleOptions}
              {errorLine}
              {onConfirmStyles && confirmLabel ? (
                <Button label={confirmLabel} onPress={onConfirmStyles} size="large"
                  testID="daily-formality-styles-done" />
              ) : null}
            </>
          ) : (
            <>
              <Button label={copy.usualAction} onPress={() => onChoose(usual)} size="large"
                testID="daily-formality-usual" />
              <View style={styles.different}>
                <AppText colorRole="textSecondary" testID="daily-formality-different" variant="caption">
                  {period === 'evening' ? copy.differentQuestionEvening : copy.differentQuestion}
                </AppText>
                <DayTypeTiles except={usual} language={language} onSelect={onChoose} selected={null}
                  testID="daily-formality" />
              </View>
              {errorLine}
              <Button label={copy.pickStyles} onPress={onPickStyles} style={styles.pickStyles}
                testID="daily-formality-pick-styles" variant="plain" />
            </>
          )}
        </StepFade>
      </ScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  questionSlot: { flex: 1 },
  question: { fontWeight: '600', marginTop: spacing.xs },
  step: { gap: spacing.md },
  // The line names the tiles under it, so it binds to them (Law 2).
  different: { gap: spacing.xs },
  pickStyles: { alignSelf: 'center' },
});
