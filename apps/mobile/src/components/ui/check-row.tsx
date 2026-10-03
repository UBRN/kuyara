import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const CHECK_SIZE = 24;

export type CheckRowProps = Readonly<{
  /** The row's picture, such as a garment tile; decorative, the words carry the choice. */
  leading: ReactNode;
  label: string;
  /** Parts show apart by a middle dot and are spoken apart by a comma: no spoken label carries the dot. */
  supportingText?: string | readonly string[];
  checked: boolean;
  onPress: () => void;
  /** A limit is reached: the row keeps its words, says why in the hint and ignores a press. */
  unavailable?: boolean;
  accessibilityHint?: string;
  testID: string;
}>;

/**
 * One choice of a multi-choice list on a sheet: the picture, the words and a trailing
 * circle that fills with a check when chosen, so the state is shape and colour together.
 * The whole row is the checkbox and a 44-point target, 60 while Easier to see is on.
 */
export function CheckRow({
  accessibilityHint, checked, label, leading, onPress, supportingText, testID, unavailable = false,
}: CheckRowProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const minHeight = useEasierToSee() ? easierToSee.rowHeight : layout.minimumTouchTarget;
  const supporting = supportingText === undefined ? [] : typeof supportingText === 'string' ? [supportingText] : supportingText;

  return (
    <PressScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={[label, ...supporting].join(', ')}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [styles.row, {
        minHeight,
        opacity: unavailable ? theme.interaction.disabledOpacity : pressed ? theme.interaction.pressedOpacity : 1,
      }]}
      testID={testID}>
      {leading}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {supporting.length > 0
          ? <AppText colorRole="textSecondary" variant="caption">{supporting.join(' · ')}</AppText> : null}
      </View>
      <View testID={`${testID}-${checked ? 'checked' : 'unchecked'}`}>
        <Icon
          color={checked ? theme.colors.brandAccent : theme.colors.borderDefined}
          name={checked ? 'checkCircle' : 'circle'}
          size={CHECK_SIZE * controlScale}
        />
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1, flexShrink: 1, gap: spacing.xs },
});
