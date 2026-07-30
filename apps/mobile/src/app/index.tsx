import * as Device from 'expo-device';
import { Platform, StyleSheet, View } from 'react-native';

import { HintRow } from '@/components/hint-row';
import { AppText, Screen, Surface } from '@/components/ui';
import { WebBadge } from '@/components/web-badge';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

function getDevMenuHint(messages: AppMessages) {
  if (Platform.OS === 'web') {
    return <AppText variant="caption">{messages.home.browserDevTools}</AppText>;
  }
  if (Device.isDevice) {
    return <AppText variant="caption">{messages.home.deviceDevMenu}</AppText>;
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return <AppText variant="caption">{messages.home.simulatorDevMenu(shortcut)}</AppText>;
}

export default function HomeScreen() {
  const messages = useMessages();

  return (
    <Screen testID="home-screen" contentContainerStyle={styles.content}>
      <View style={styles.heroSection}>
        <AppText accessibilityRole="header" variant="display" style={styles.title}>
          {messages.home.title}
        </AppText>
      </View>

      <AppText variant="label" style={styles.code}>
        {messages.home.start}
      </AppText>

      <Surface style={styles.stepContainer}>
        <HintRow
          title={messages.home.tryEditing}
          hint={<AppText variant="code">src/app/index.tsx</AppText>}
        />
        <HintRow title={messages.home.devTools} hint={getDevMenuHint(messages)} />
        <HintRow
          title={messages.home.freshStart}
          hint={<AppText variant="code">pnpm run reset-project</AppText>}
        />
      </Surface>

      {Platform.OS === 'web' && <WebBadge />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroSection: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  title: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: spacing.lg,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
});
