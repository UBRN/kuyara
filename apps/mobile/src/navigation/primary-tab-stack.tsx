import { Stack } from 'expo-router';

import { useKuyaraTheme } from '@/theme/theme-context';

export function PrimaryTabStack() {
  const theme = useKuyaraTheme();

  return (
    <Stack
      screenOptions={{
        animation: theme.isReduceMotionEnabled ? 'none' : 'default',
        headerShown: false,
      }}
    />
  );
}
