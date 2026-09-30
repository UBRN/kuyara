import { useRef } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import { useKuyaraTheme } from '@/theme/theme-context';

export function WeatherLocationScreen() {
  const theme = useKuyaraTheme();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  // A chosen place closes the picker and Weather shows it. A second tap that lands before the
  // stack has popped must not pop Weather itself, so the picker closes once.
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/weather');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID="weather-location-screen">
      <LocationSelectionControls
        onLocationSelected={close}
        testID="weather-location-controls"
        testIDPrefix="weather"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
