import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function WebBadge() {
  const theme = useKuyaraTheme();

  return (
    <View style={styles.container}>
      <AppText variant="code" colorRole="textSecondary" style={styles.versionText}>
        v{version}
      </AppText>
      <Image
        source={
          theme.isDark
            ? require('@/assets/images/expo-badge-white.png')
            : require('@/assets/images/expo-badge.png')
        }
        style={styles.badgeImage}
      />
    </View>
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
