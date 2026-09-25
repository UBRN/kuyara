import type { DressStyle } from '@kuyara/contracts';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { AppText, GarmentDrawing, GlassButton, Icon, NativeSheet, useTextScaling } from '@/components/ui';
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
 * The day-type question (M6 step 1). One tap on a tile chooses and closes the sheet; the
 * current answer is checked by three cues together (accent border, interactive fill and a
 * check glyph), so it is never told by colour alone. Lasting style changes live only in
 * Settings > Profile (M18), so the sheet offers none.
 */
export function DailyFormalitySheet({
  visible, language, mode, selected, firstDay = false, onChoose, onDismiss, error,
}: Readonly<{
  visible: boolean;
  language: SupportedLanguage;
  mode: 'today' | 'tomorrow';
  /** The answer checked when the sheet opens, so one tap confirms it. */
  selected: DressStyle;
  /** The day onboarding finished: the checked answer is the one given in setup. */
  firstDay?: boolean;
  onChoose: (style: DressStyle) => void;
  onDismiss: () => void;
  error: boolean;
}>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const copy = getMessages(language).today.dailyStyle;
  const glyphSize = GLYPH_SIZE * Math.min(controlScale, GLYPH_SCALE_CAP);
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} testID="daily-formality-sheet">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <AppText accessibilityRole="header" style={styles.question} variant="title">
            {mode === 'tomorrow' ? copy.questionTomorrow : copy.question}
          </AppText>
          <GlassButton
            kind="close"
            label={copy.close}
            onPress={onDismiss}
            testID="daily-formality-close"
          />
        </View>
        {firstDay ? (
          <AppText colorRole="textSecondary" testID="daily-formality-first-day" variant="caption">
            {copy.firstDayNote}
          </AppText>
        ) : null}
        <View accessibilityRole="radiogroup" style={styles.tiles} testID="daily-formality-choices">
          {choices.map(({ style, garmentTypeId, category }) => {
            const checked = style === selected;
            return (
              <Pressable
                accessibilityLabel={copy[style]}
                accessibilityRole="radio"
                accessibilityState={{ selected: checked }}
                key={style}
                onPress={() => onChoose(style)}
                style={({ pressed }) => [styles.tile, {
                  backgroundColor: checked ? theme.colors.surfaceInteractive : theme.colors.surface,
                  borderColor: checked ? theme.colors.brandAccent : theme.colors.borderDefined,
                  borderWidth: checked ? borderWidths.strong : borderWidths.subtle,
                  opacity: pressed ? theme.interaction.pressedOpacity : 1,
                }]}
                testID={`daily-formality-${style}`}>
                <GarmentDrawing
                  category={category}
                  garmentTypeId={garmentTypeId}
                  size={glyphSize}
                  testID={`daily-formality-${style}-drawing`}
                />
                <AppText style={styles.label} variant="bodyStrong">{copy[style]}</AppText>
                {checked ? (
                  <View style={styles.check} testID={`daily-formality-${style}-check`}>
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
