import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import { useKuyaraTheme } from '@/theme/theme-context';

export function WeatherLocationScreen() {
  const theme = useKuyaraTheme();
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID="weather-location-screen">
      <LocationSelectionControls
        testID="weather-location-controls"
        testIDPrefix="weather"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
