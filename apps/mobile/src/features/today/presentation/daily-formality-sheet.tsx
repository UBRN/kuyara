import type { DressStyle } from '@kuyara/contracts';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { AppText, Button, GarmentDrawing, GlassButton, Icon, NativeSheet, useTextScaling } from '@/components/ui';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The three day types, each with a shipped ADR 0025 drawing (M6): Casual the tee, Smart the
// shirt, Formal the blazer. They are pictures, never the only signal; the word is under each.
const choices = [
  { style: 'casual', garmentTypeId: 't_shirt', category: 'top' },
  { style: 'smart', garmentTypeId: 'shirt', category: 'top' },
  { style: 'formal', garmentTypeId: 'blazer', category: 'outerwear' },
] as const satisfies readonly Readonly<{ style: DressStyle; garmentTypeId: GarmentTypeId; category: string }>[];
const GLYPH_SIZE = 40;
// The drawing grows with the text only a little, so three tiles still fit one row.
const GLYPH_SCALE_CAP = 1.15;
const CHECK_SIZE = 20;

/**
 * The three day-type tiles as one radio group. The checked answer is told by three cues
 * together (accent border, interactive fill and a check glyph), never by colour alone. With
 * nothing checked (the 18:00 evening sheet, N20) every tile draws its resting state.
 */
export function DayTypeTiles({
  language, selected, onSelect, testID,
}: Readonly<{
  language: SupportedLanguage;
  selected: DressStyle | null;
  onSelect: (style: DressStyle) => void;
  testID: string;
}>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const copy = getMessages(language).today.dailyStyle;
  const glyphSize = GLYPH_SIZE * Math.min(controlScale, GLYPH_SCALE_CAP);
  return (
    <View accessibilityRole="radiogroup" style={styles.tiles} testID={`${testID}-choices`}>
      {choices.map(({ style, garmentTypeId, category }) => {
        const checked = style === selected;
        return (
          <Pressable
            accessibilityLabel={copy[style]}
            accessibilityRole="radio"
            accessibilityState={{ selected: checked }}
            key={style}
            onPress={() => onSelect(style)}
            style={({ pressed }) => [styles.tile, {
              backgroundColor: checked ? theme.colors.surfaceInteractive : theme.colors.surface,
              borderColor: checked ? theme.colors.brandAccent : theme.colors.borderDefined,
              borderWidth: checked ? borderWidths.strong : borderWidths.subtle,
              opacity: pressed ? theme.interaction.pressedOpacity : 1,
            }]}
            testID={`${testID}-${style}`}>
            <GarmentDrawing
              category={category}
              garmentTypeId={garmentTypeId}
              size={glyphSize}
              testID={`${testID}-${style}-drawing`}
            />
            <AppText style={styles.label} variant="bodyStrong">{copy[style]}</AppText>
            {checked ? (
              <View style={styles.check} testID={`${testID}-${style}-check`}>
                <Icon
                  color={theme.colors.brandAccent}
                  name="checkCircle"
                  size={CHECK_SIZE * Math.min(controlScale, GLYPH_SCALE_CAP)}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
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
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { alignItems: 'center', borderRadius: radii.control, flex: 1, gap: spacing.sm,
    justifyContent: 'center', minHeight: 128, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  label: { textAlign: 'center' },
  check: { position: 'absolute', right: spacing.xs, top: spacing.xs },
});
