import { useState, type ReactNode } from 'react';
import type { DressStyle } from '@kuyara/contracts';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Icon, NativeSheet } from '@/components/ui';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const choices = ['casual', 'smart', 'formal'] as const;

export function DailyFormalitySheet({
  visible, language, mode, onChoose, onDismiss, error,
  stylePreferences, aestheticsSaving,
}: Readonly<{
  visible: boolean;
  language: SupportedLanguage;
  mode: 'morning' | 'plan';
  onChoose: (style: DressStyle) => void;
  onDismiss: () => void;
  error: boolean;
  stylePreferences: ReactNode;
  aestheticsSaving: boolean;
}>) {
  const theme = useKuyaraTheme();
  const messages = getMessages(language);
  const copy = messages.today.dailyStyle;
  const [showMore, setShowMore] = useState(false);
  const dismiss = () => { setShowMore(false); onDismiss(); };
  return (
    <NativeSheet visible={visible} onDismiss={dismiss} testID="daily-formality-sheet">
      <ScrollView contentContainerStyle={styles.content}>
        <AppText accessibilityRole="header" variant="titleLarge">
          {mode === 'plan' ? copy.questionTomorrow : copy.question}
        </AppText>
        {choices.map((style) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: aestheticsSaving }}
            disabled={aestheticsSaving}
            key={style}
            onPress={() => { setShowMore(false); onChoose(style); }}
            style={({ pressed }) => [styles.choice, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderDefined,
              opacity: aestheticsSaving ? theme.interaction.disabledOpacity
                : pressed ? theme.interaction.pressedOpacity : 1,
            }]}
            testID={`daily-formality-${style}`}>
            <AppText variant="bodyStrong" style={styles.label}>{copy[style]}</AppText>
            <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMore }}
          onPress={() => setShowMore((expanded) => !expanded)}
          style={styles.more} testID="daily-formality-more">
          <AppText variant="bodyStrong" style={styles.label}>{copy.more}</AppText>
          <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
        </Pressable>
        {showMore ? (
          <View style={styles.preferences}>
            <AppText>{copy.lastingStylePreferences}</AppText>
            {stylePreferences}
          </View>
        ) : null}
        {error ? <AppText accessibilityRole="alert">{copy.saveError}</AppText> : null}
        <Pressable accessibilityRole="button" onPress={dismiss}
          style={styles.close} testID="daily-formality-close">
          <AppText variant="label">{copy.close}</AppText>
        </Pressable>
      </ScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.lg },
  choice: { alignItems: 'center', borderRadius: radii.control,
    borderWidth: borderWidths.subtle, flexDirection: 'row',
    minHeight: layout.minimumTouchTarget, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  more: { alignItems: 'center', flexDirection: 'row', minHeight: layout.minimumTouchTarget },
  preferences: { gap: spacing.md },
  label: { flex: 1 },
  close: { alignItems: 'center', minHeight: layout.minimumTouchTarget, justifyContent: 'center' },
});
