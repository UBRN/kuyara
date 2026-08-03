import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { resolvePillColors, type PillTone } from '@/components/ui/primitive-contracts';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PillProps = Readonly<{
  label: string;
  tone?: PillTone;
  testID?: string;
}>;

export function Pill({ label, tone = 'accent-filled', testID }: PillProps) {
  const theme = useKuyaraTheme();
  const { backgroundColor, borderColor, textColorRole } = resolvePillColors(theme, tone);

  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]} testID={testID}>
      <AppText colorRole={textColorRole} style={styles.label} variant="caption">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
