import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Icon, type IconName } from '@/components/ui';
import type { AppMessages } from '@/localization/messages';
import { withAlpha } from '@/theme/color-alpha';
import { borderWidths, interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PrimaryTabRouteName = '(today)' | 'weather' | '(profile)';

export type PrimaryTabDefinition = Readonly<{
  accessibilityLabel: string;
  icon: IconName;
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
      icon: 'tabToday',
      label: labels.today,
      routeName: '(today)',
      testID: 'tab-today',
    },
    {
      accessibilityLabel: labels.weather,
      icon: 'tabWeather',
      label: labels.weather,
      routeName: 'weather',
      testID: 'tab-weather',
    },
    {
      accessibilityLabel: labels.profile,
      icon: 'tabProfile',
      label: labels.profile,
      routeName: '(profile)',
      testID: 'tab-profile',
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
        theme.elevation.chrome,
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
            <Icon color={color} name={tab.icon} size={25} />
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
