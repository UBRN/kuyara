import { Tabs } from 'expo-router';

import { useMessages } from '@/localization/use-messages';
import {
  createPrimaryTabDefinitions,
  PrimaryTabBar,
  type PrimaryTabRouteName,
} from '@/navigation/primary-tab-bar';
import { useKuyaraTheme } from '@/theme/theme-context';

export function PrimaryTabs() {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const labels = messages.navigation;
  const tabs = createPrimaryTabDefinitions(labels);

  return (
    <Tabs
      backBehavior="initialRoute"
      initialRouteName="(today)"
      tabBar={({ navigation, state }) => {
        const selectedRouteName = state.routes[state.index]
          .name as PrimaryTabRouteName;
        const selectRoute = (routeName: PrimaryTabRouteName) => {
          const route = state.routes.find((candidate) => candidate.name === routeName);

          if (!route) {
            return;
          }

          const event = navigation.emit({
            canPreventDefault: true,
            target: route.key,
            type: 'tabPress',
          });

          if (routeName !== selectedRouteName && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <PrimaryTabBar
            onLongPress={(routeName) => {
              const route = state.routes.find(
                (candidate) => candidate.name === routeName,
              );

              if (route) {
                navigation.emit({ target: route.key, type: 'tabLongPress' });
              }
            }}
            onSelect={selectRoute}
            selectedRouteName={selectedRouteName}
            tabs={tabs}
          />
        );
      }}
      screenOptions={{
        headerShown: false,
        animation: theme.isReduceMotionEnabled ? 'none' : undefined,
      }}>
      <Tabs.Screen
        name="(today)"
        options={{
          tabBarAccessibilityLabel: labels.today,
          tabBarButtonTestID: "tab-today",
          title: labels.today,
        }}
      />
      <Tabs.Screen
        name="weather"
        options={{
          tabBarAccessibilityLabel: labels.weather,
          tabBarButtonTestID: "tab-weather",
          title: labels.weather,
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          tabBarAccessibilityLabel: labels.profile,
          tabBarButtonTestID: "tab-profile",
          title: labels.profile,
        }}
      />
    </Tabs>
  );
}
