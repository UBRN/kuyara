import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { IconButton, SectionHeader, Surface } from '@/components/ui';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type CollapsibleProps = PropsWithChildren<{
  title: string;
  collapsedAccessibilityLabel: string;
  expandedAccessibilityLabel: string;
}>;

export function Collapsible({
  children,
  collapsedAccessibilityLabel,
  expandedAccessibilityLabel,
  title,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useKuyaraTheme();

  return (
    <View>
      <SectionHeader
        title={title}
        trailingAction={
          <IconButton
            accessibilityLabel={
              isOpen ? expandedAccessibilityLabel : collapsedAccessibilityLabel
            }
            accessibilityState={{ expanded: isOpen }}
            icon={(color) => (
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={14}
                weight="bold"
                tintColor={color}
                style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
              />
            )}
            onPress={() => setIsOpen((value) => !value)}
          />
        }
      />
      {isOpen && (
        <Animated.View
          entering={
            theme.isReduceMotionEnabled ? undefined : FadeIn.duration(theme.motion.normal)
          }>
          <Surface variant="muted" style={styles.content}>
            {children}
          </Surface>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    marginTop: spacing.md,
    padding: spacing.xl,
    gap: spacing.md,
  },
});
