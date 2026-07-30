import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import type { AppMessages } from '@/localization/messages';
import { borderWidths, interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PrimaryTabRouteName = '(today)' | 'weather' | 'wardrobe' | 'settings';

export type PrimaryTabDefinition = Readonly<{
  accessibilityLabel: string;
  icon: SymbolViewProps['name'];
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
      icon: { ios: 'calendar', android: 'today', web: 'today' },
      label: labels.today,
      routeName: '(today)',
      testID: 'tab-today',
    },
    {
      accessibilityLabel: labels.weather,
      icon: {
        ios: 'cloud.sun.fill',
        android: 'partly_cloudy_day',
        web: 'partly_cloudy_day',
      },
      label: labels.weather,
      routeName: 'weather',
      testID: 'tab-weather',
    },
    {
      accessibilityLabel: labels.wardrobe,
      icon: { ios: 'tshirt.fill', android: 'checkroom', web: 'checkroom' },
      label: labels.wardrobe,
      routeName: 'wardrobe',
      testID: 'tab-wardrobe',
    },
    {
      accessibilityLabel: labels.settings,
      icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
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
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: theme.colors.borderSubtle,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}>
      {tabs.map((tab) => {
        const isSelected = tab.routeName === selectedRouteName;
        const color = isSelected
          ? theme.colors.brandPrimary
          : theme.colors.iconSecondary;

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
            <SymbolView
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name={tab.icon}
              size={24}
              tintColor={color}
            />
            <AppText
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ color }}
              variant={isSelected ? 'label' : 'caption'}>
              {tab.label}
            </AppText>
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
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
