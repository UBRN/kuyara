import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function WebBadge() {
  const theme = useKuyaraTheme();

  return (
    <ThemedView style={styles.container}>
      <ThemedText variant="code" themeColor="textSecondary" style={styles.versionText}>
        v{version}
      </ThemedText>
      <Image
        source={
          theme.isDark
            ? require('@/assets/images/expo-badge-white.png')
            : require('@/assets/images/expo-badge.png')
        }
        style={styles.badgeImage}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  versionText: {
    textAlign: 'center',
  },
  badgeImage: {
    width: 123,
    aspectRatio: 123 / 24,
  },
});
