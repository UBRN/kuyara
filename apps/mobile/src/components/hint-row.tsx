import type { ReactNode } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title, hint }: HintRowProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;

  return (
    <View style={[styles.stepRow, usesStackedLayout && styles.stackedStepRow]}>
      <ThemedText variant="label" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedView
        backgroundRole="surfaceInteractive"
        style={[
          styles.codeSnippet,
          usesStackedLayout && styles.stackedCodeSnippet,
          { borderColor: theme.colors.borderSubtle },
        ]}>
        <ThemedText variant="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </ThemedView>
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
    borderRadius: radii.compact,
    borderWidth: borderWidths.subtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexShrink: 1,
  },
  stackedCodeSnippet: {
    alignSelf: 'stretch',
  },
});
