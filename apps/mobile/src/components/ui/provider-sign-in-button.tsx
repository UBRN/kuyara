import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import { resolveInteractiveAccessibilityState } from '@/components/ui/primitive-contracts';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The two sign-in providers' own buttons (ADR 0041 section 5). Their colours are the
// platforms' marks, not kuyara roles, so they live here and nowhere in feature code:
// - Apple (Human Interface Guidelines, Sign in with Apple): a black button in the light
//   appearance and a white one in the dark, the Apple logo beside the title, the title in
//   the system font, any corner radius, never shorter than 44 points.
// - Google (Sign in with Google branding guidelines): the light theme is a white fill with
//   a #747775 one-point edge and #1F1F1F text, the dark theme a #131314 fill with a #8E918F
//   edge and #E3E3E3 text, and the four-colour "G" is never recoloured or resized apart.
// Both are the same height and width (Apple's rule that its button is no smaller than the
// others), which is the large control height plus the extra a thumb-reach action takes.
const HEIGHT = 56;
const LOGO_SIZE = 20;

const APPLE = {
  light: { fill: '#000000', ink: '#FFFFFF', edge: '#000000' },
  dark: { fill: '#FFFFFF', ink: '#000000', edge: '#FFFFFF' },
} as const;
const GOOGLE = {
  light: { fill: '#FFFFFF', ink: '#1F1F1F', edge: '#747775' },
  dark: { fill: '#131314', ink: '#E3E3E3', edge: '#8E918F' },
} as const;

function GoogleMark() {
  return (
    <Svg height={LOGO_SIZE} viewBox="0 0 48 48" width={LOGO_SIZE}>
      <Path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" fill="#EA4335" />
      <Path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" fill="#4285F4" />
      <Path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" fill="#FBBC05" />
      <Path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" fill="#34A853" />
    </Svg>
  );
}

export type ProviderSignInButtonProps = Readonly<{
  provider: 'apple' | 'google';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The tapped button keeps its title and shows the system spinner in place of its logo. */
  loading?: boolean;
  testID?: string;
}>;

export function ProviderSignInButton({ disabled = false, label, loading = false, onPress, provider, testID }: ProviderSignInButtonProps) {
  const theme = useKuyaraTheme();
  const colors = (provider === 'apple' ? APPLE : GOOGLE)[theme.isDark ? 'dark' : 'light'];
  const inactive = disabled || loading;

  return (
    <PressScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={resolveInteractiveAccessibilityState(inactive, loading)}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.fill, borderColor: colors.edge, opacity: disabled && !loading ? 0.5 : 1 },
      ]}
      testID={testID}>
      <View style={styles.logo}>
        {loading ? (
          <ActivityIndicator color={colors.ink} testID={testID ? `${testID}-loading` : undefined} />
        ) : provider === 'apple' ? (
          <Icon color={colors.ink} name="appleLogo" size={LOGO_SIZE} />
        ) : (
          <GoogleMark />
        )}
      </View>
      <AppText style={[styles.label, { color: colors.ink }]} variant="body">
        {label}
      </AppText>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    alignItems: 'center',
    height: LOGO_SIZE + 4,
    justifyContent: 'center',
    width: LOGO_SIZE + 4,
  },
  // Both platforms title their buttons in a medium weight of the system font.
  label: { flexShrink: 1, fontWeight: '500' },
});
