import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { haptics, iconNames } from '@/components/ui';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PrimaryTabRouteName = '(today)' | 'weather' | '(profile)';

export type PrimaryTabDefinition = Readonly<{
  accessibilityLabel: string;
  icon: (typeof iconNames)['tabToday' | 'tabWeather' | 'tabProfile'];
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
      label: labels.today,
      routeName: '(today)',
      testID: 'tab-today',
    },
    {
      accessibilityLabel: labels.weather,
      icon: iconNames.tabWeather,
      label: labels.weather,
      routeName: 'weather',
      testID: 'tab-weather',
    },
    {
      accessibilityLabel: labels.profile,
      icon: iconNames.tabProfile,
      label: labels.profile,
      routeName: '(profile)',
      testID: 'tab-profile',
    },
  ];
}

export function PrimaryTabs() {
  const labels = useMessages().navigation;
  const theme = useKuyaraTheme();
  const tabs = createPrimaryTabDefinitions(labels);

  return (
    <NativeTabs backBehavior="initialRoute" tintColor={theme.colors.brandPrimary}>
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
          <NativeTabs.Trigger.Icon sf={tab.icon.ios} md={tab.icon.android} />
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
