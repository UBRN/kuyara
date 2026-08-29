import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import type { AppMessages } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { borderWidths, interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PrimaryTabRouteName = '(today)' | 'weather' | 'wardrobe' | 'settings';

export type PrimaryTabDefinition = Readonly<{
  accessibilityLabel: string;
  label: string;
  routeName: PrimaryTabRouteName;
  testID: string;
}>;

export function createPrimaryTabDefinitions(
  labels: AppMessages['navigation'],
): readonly PrimaryTabDefinition[] {
  return [
    {
      accessibilityLabel: labels.today,
      label: labels.today,
      routeName: '(today)',
      testID: 'tab-today',
    },
    {
      accessibilityLabel: labels.weather,
      label: labels.weather,
      routeName: 'weather',
      testID: 'tab-weather',
    },
    {
      accessibilityLabel: labels.wardrobe,
      label: labels.wardrobe,
      routeName: 'wardrobe',
      testID: 'tab-wardrobe',
    },
    {
      accessibilityLabel: labels.settings,
      label: labels.settings,
      routeName: 'settings',
      testID: 'tab-settings',
    },
  ];
}

type PrimaryTabBarProps = Readonly<{
  onLongPress: (routeName: PrimaryTabRouteName) => void;
  onSelect: (routeName: PrimaryTabRouteName) => void;
  selectedRouteName: PrimaryTabRouteName;
  tabs: readonly PrimaryTabDefinition[];
}>;

export function PrimaryTabBar({
  onLongPress,
  onSelect,
  selectedRouteName,
  tabs,
}: PrimaryTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useKuyaraTheme();

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: withAlpha(theme.colors.backgroundElevated, 0.92),
          borderTopColor: theme.colors.borderSubtle,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}>
      {tabs.map((tab) => {
        const isSelected = tab.routeName === selectedRouteName;
        const color = isSelected ? theme.colors.brandPrimary : theme.colors.iconSecondary;

        return (
          <Pressable
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={tab.routeName}
            onLongPress={() => onLongPress(tab.routeName)}
            onPress={() => onSelect(tab.routeName)}
            style={({ pressed }) => [
              styles.tab,
              pressed && styles.pressed,
            ]}
            testID={tab.testID}>
            <AppText
              accessibilityElementsHidden
              ellipsizeMode="tail"
              importantForAccessibility="no"
              numberOfLines={1}
              style={{ color }}
              variant={isSelected ? 'label' : 'caption'}>
              {tab.label}
            </AppText>
            <View
              style={[
                styles.indicator,
                { backgroundColor: isSelected ? theme.colors.brandPrimary : 'transparent' },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    alignItems: 'flex-start',
    borderTopWidth: borderWidths.subtle,
    flexDirection: 'row',
    paddingTop: spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  indicator: {
    borderRadius: 1,
    height: 2,
    width: 14,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
