import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/theme/theme';

export type SectionHeaderProps = {
  title: string;
  supportingText?: string;
  trailingAction?: ReactNode;
};

export function SectionHeader({ title, supportingText, trailingAction }: SectionHeaderProps) {
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;

  return (
    <View style={[styles.container, usesStackedLayout && styles.stackedContainer]}>
      <View style={styles.textContainer}>
        <AppText accessibilityRole="header" variant="title">
          {title}
        </AppText>
        {supportingText ? (
          <AppText colorRole="textSecondary">{supportingText}</AppText>
        ) : null}
      </View>
      {trailingAction ? (
        <View style={usesStackedLayout ? styles.stackedAction : styles.action}>
          {trailingAction}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stackedContainer: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  textContainer: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
  action: {
    flexShrink: 0,
  },
  stackedAction: {
    alignSelf: 'flex-start',
  },
});
