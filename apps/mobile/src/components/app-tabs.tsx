import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useMessages } from '@/localization/use-messages';
import { useKuyaraTheme } from '@/theme/theme-context';

export default function AppTabs() {
  const messages = useMessages();
  const theme = useKuyaraTheme();

  return (
    <NativeTabs
      backgroundColor={theme.colors.backgroundElevated}
      iconColor={{
        default: theme.colors.iconSecondary,
        selected: theme.colors.brandPrimary,
      }}
      indicatorColor={theme.colors.surfaceInteractive}
      labelStyle={{
        default: { color: theme.colors.textSecondary },
        selected: { color: theme.colors.textPrimary },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{messages.tabs.home}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>{messages.tabs.explore}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
