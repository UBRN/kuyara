import type { ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { spacing } from '@/theme/theme';

type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title, hint }: HintRowProps) {
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;

  return (
    <View style={[styles.stepRow, usesStackedLayout && styles.stackedStepRow]}>
      <AppText variant="label" style={styles.title}>
        {title}
      </AppText>
      <Surface
        variant="interactive"
        style={[
          styles.codeSnippet,
          usesStackedLayout && styles.stackedCodeSnippet,
        ]}>
        <AppText variant="caption" colorRole="textSecondary">
          {hint}
        </AppText>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  stackedStepRow: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  title: {
    flexShrink: 1,
  },
  codeSnippet: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexShrink: 1,
  },
  stackedCodeSnippet: {
    alignSelf: 'stretch',
  },
});
