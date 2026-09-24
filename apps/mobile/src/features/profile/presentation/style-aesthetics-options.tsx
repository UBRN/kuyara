import { styleAesthetics, type StyleAesthetic } from '@kuyara/contracts';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import type { PreferenceMessages } from '@/localization/messages';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const labelKeys = {
  minimal: 'styleAestheticMinimal', classic: 'styleAestheticClassic',
  sporty: 'styleAestheticSporty', streetwear: 'styleAestheticStreetwear',
  relaxed: 'styleAestheticRelaxed',
} as const satisfies Record<StyleAesthetic, keyof PreferenceMessages>;

export function aestheticLabels(copy: PreferenceMessages, values: readonly StyleAesthetic[]): string {
  return values.length ? values.map((id) => copy[labelKeys[id]]).join(', ') : copy.stylePreferencesNone;
}

export function StyleAestheticsOptions({
  copy, selected, onChange, testID, disabled: saving = false,
}: Readonly<{
  copy: PreferenceMessages;
  selected: readonly StyleAesthetic[];
  onChange: (values: readonly StyleAesthetic[]) => void;
  testID: string;
  disabled?: boolean;
}>) {
  const theme = useKuyaraTheme();
  const atLimit = selected.length >= 3;
  return (
    <View style={styles.options} testID={testID}>
      {styleAesthetics.map((id) => {
        const checked = selected.includes(id);
        const disabled = saving || (atLimit && !checked);
        return (
          <Pressable
            accessibilityLabel={copy[labelKeys[id]]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            key={id}
            onPress={() => onChange(checked
              ? selected.filter((value) => value !== id)
              : [...selected, id].sort())}
            style={({ pressed }) => [styles.option, {
              borderColor: checked ? theme.colors.brandAccent : theme.colors.borderDefined,
              backgroundColor: theme.colors.surface,
              opacity: disabled ? theme.interaction.disabledOpacity : pressed ? theme.interaction.pressedOpacity : 1,
            }]}
            testID={`${testID}-${id}`}>
            <AppText variant="bodyStrong" style={styles.label}>{copy[labelKeys[id]]}</AppText>
            <Icon color={checked ? theme.colors.brandAccent : theme.colors.iconSecondary}
              name={checked ? 'checkCircle' : 'circle'} size={24} />
          </Pressable>
        );
      })}
      {atLimit ? <AppText variant="caption">{copy.stylePreferencesLimit}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.md },
  option: {
    alignItems: 'center', borderRadius: radii.control, borderWidth: borderWidths.strong,
    flexDirection: 'row', gap: spacing.md, minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  label: { flex: 1 },
});
