import * as Device from 'expo-device';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { platformLayout } from '@/theme/platform';

function getDevMenuHint(messages: AppMessages) {
  if (Platform.OS === 'web') {
    return <ThemedText variant="caption">{messages.home.browserDevTools}</ThemedText>;
  }
  if (Device.isDevice) {
    return <ThemedText variant="caption">{messages.home.deviceDevMenu}</ThemedText>;
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return <ThemedText variant="caption">{messages.home.simulatorDevMenu(shortcut)}</ThemedText>;
}

export default function HomeScreen() {
  const messages = useMessages();

  return (
    <ThemedView testID="home-screen" style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.heroSection}>
            <ThemedText accessibilityRole="header" variant="display" style={styles.title}>
              {messages.home.title}
            </ThemedText>
          </ThemedView>

          <ThemedText variant="label" style={styles.code}>
            {messages.home.start}
          </ThemedText>

          <ThemedView backgroundRole="surface" style={styles.stepContainer}>
            <HintRow
              title={messages.home.tryEditing}
              hint={<ThemedText variant="code">src/app/index.tsx</ThemedText>}
            />
            <HintRow title={messages.home.devTools} hint={getDevMenuHint(messages)} />
            <HintRow
              title={messages.home.freshStart}
              hint={<ThemedText variant="code">pnpm run reset-project</ThemedText>}
            />
          </ThemedView>

          {Platform.OS === 'web' && <WebBadge />}
        </SafeAreaView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  safeArea: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: platformLayout.bottomTabInset + spacing.lg,
    maxWidth: layout.maxContentWidth,
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
    borderRadius: radii.card,
  },
});
