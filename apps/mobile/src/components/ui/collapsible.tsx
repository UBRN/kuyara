import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useKuyaraTheme();

  return (
    <ThemedView backgroundRole="background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => [styles.heading, pressed && styles.pressedHeading]}
        onPress={() => setIsOpen((value) => !value)}>
        <ThemedView backgroundRole="surfaceInteractive" style={styles.button}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            weight="bold"
            tintColor={theme.colors.iconPrimary}
            style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
          />
        </ThemedView>

        <ThemedText variant="label" style={styles.headingText}>
          {title}
        </ThemedText>
      </Pressable>
      {isOpen && (
        <Animated.View
          entering={
            theme.isReduceMotionEnabled ? undefined : FadeIn.duration(theme.motion.normal)
          }>
          <ThemedView backgroundRole="surfaceMuted" style={styles.content}>
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minimumTouchTarget,
  },
  pressedHeading: {
    opacity: interaction.pressedOpacity,
  },
  headingText: {
    flex: 1,
    flexShrink: 1,
  },
  button: {
    width: spacing['2xl'],
    height: spacing['2xl'],
    borderRadius: radii.control,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginTop: spacing.md,
    borderRadius: radii.card,
    marginLeft: spacing.xl,
    padding: spacing.xl,
  },
});
