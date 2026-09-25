import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTextScaling } from '@/components/ui/use-text-scaling';
import { spacing } from '@/theme/theme';

export type ButtonPairProps = Readonly<{
  /** The stronger action. A pair is at least one weight apart; two prominent never pair. */
  primary: ReactNode;
  secondary?: ReactNode;
  /**
   * `trailing` puts the stronger action last on the row (Back, Continue); `leading` puts it
   * first (an offer and its dismissal inside a card).
   */
  align?: 'leading' | 'trailing';
  testID?: string;
}>;

/**
 * O5's pair placement: side by side at ordinary text sizes, stacked with the stronger action
 * first once the text factor passes 1.2, so neither label is squeezed into a third line.
 */
export function ButtonPair({ align = 'trailing', primary, secondary, testID }: ButtonPairProps) {
  const { stacksButtonPair } = useTextScaling();

  if (stacksButtonPair) {
    return (
      <View style={styles.stacked} testID={testID}>
        {primary}
        {secondary}
      </View>
    );
  }

  return (
    <View style={[styles.row, align === 'trailing' && styles.trailing]} testID={testID}>
      {align === 'trailing' ? secondary : primary}
      {align === 'trailing' ? primary : secondary}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  trailing: {
    justifyContent: 'flex-end',
  },
  stacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.sm,
  },
});
