import { Platform } from 'react-native';

import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { haptics, iconNames } from '@/components/ui';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PrimaryTabRouteName = '(today)' | 'weather' | '(profile)';

export type PrimaryTabDefinition = Readonly<{
  accessibilityLabel: string;
  icon: (typeof iconNames)['tabToday' | 'tabWeather' | 'tabProfile'];
  iconOutline: (typeof iconNames)[
    'tabTodayOutline' | 'tabWeatherOutline' | 'tabProfileOutline'
  ];
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
      icon: iconNames.tabToday,
      iconOutline: iconNames.tabTodayOutline,
      label: labels.today,
      routeName: '(today)',
      testID: 'tab-today',
    },
    {
      accessibilityLabel: labels.weather,
      icon: iconNames.tabWeather,
      iconOutline: iconNames.tabWeatherOutline,
      label: labels.weather,
      routeName: 'weather',
      testID: 'tab-weather',
    },
    {
      accessibilityLabel: labels.profile,
      icon: iconNames.tabProfile,
      iconOutline: iconNames.tabProfileOutline,
      label: labels.profile,
      routeName: '(profile)',
      testID: 'tab-profile',
    },
  ];
}

// The second non-colour signal differs by platform (ADR 0027). iOS has no active
// indicator, so the selected label carries the weight of the `label` typography role.
// Material 3 Expressive states the navigation bar's label is no longer bolded when
// selected, so Android is left to its active indicator.
const selectedLabelStyle = Platform.select({
  ios: { selected: { fontWeight: typography.label.fontWeight } },
});

export function PrimaryTabs() {
  const labels = useMessages().navigation;
  const theme = useKuyaraTheme();
  const tabs = createPrimaryTabDefinitions(labels);

  return (
    <NativeTabs
      backBehavior="initialRoute"
      labelStyle={selectedLabelStyle}
      tintColor={theme.colors.brandPrimary}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger
          accessibilityLabel={tab.accessibilityLabel}
          key={tab.routeName}
          listeners={({ navigation, route }) => ({
            tabPress: () => {
              const state = navigation.getState();
              if (state.routes[state.index]?.key !== route.key) haptics.selection();
            },
          })}
          name={tab.routeName}
          testID={tab.testID}>
          <NativeTabs.Trigger.Icon
            md={tab.icon.android}
            sf={{ default: tab.iconOutline.ios, selected: tab.icon.ios }}
          />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
