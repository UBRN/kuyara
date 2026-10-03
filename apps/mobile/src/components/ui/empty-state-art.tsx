import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// How far an empty place's drawing fades: present enough to name the place, quiet enough
// that the sentence and the button lead.
export const FADED_OPACITY = 0.4;

/**
 * An empty state's picture: an existing garment drawing, faded, on the muted tile an empty
 * place keeps in both appearances. It is never the garment plate, so in the dark appearance
 * an empty place stays dark, as Profile's empty category cells do. Decorative: the sentence
 * under it carries the meaning.
 */
export function EmptyStateArt({ children, testID }: PropsWithChildren<Readonly<{ testID?: string }>>) {
  const theme = useKuyaraTheme();
  return (
    <PlateView
      accessibilityElementsHidden
      color={theme.colors.surfaceMuted}
      importantForAccessibility="no-hide-descendants"
      style={styles.tile}
      testID={testID}>
      <View style={styles.faded}>{children}</View>
    </PlateView>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.imageTile, padding: spacing.lg },
  faded: { opacity: FADED_OPACITY },
});
