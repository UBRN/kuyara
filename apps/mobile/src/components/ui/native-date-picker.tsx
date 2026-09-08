import { Host as UniversalHost } from '@expo/ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { Platform, useWindowDimensions, View } from 'react-native';

import { useKuyaraTheme } from '@/theme/theme-context';

// Load SwiftUI only on iOS, as native-list.tsx does.
const swiftUI: typeof import('@expo/ui/swift-ui') | null = Platform.OS === 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ? (require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'))
  : null;
const NativeSwiftDatePicker = swiftUI?.DatePicker ?? null;
const NativeAndroidDatePicker: typeof import('@expo/ui/jetpack-compose')['DateTimePicker'] | null = Platform.OS === 'android'
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep Compose off iOS.
  ? (require('@expo/ui/jetpack-compose') as typeof import('@expo/ui/jetpack-compose')).DateTimePicker
  : null;

export type NativeDatePickerProps = Readonly<{
  accessibilityLabel: string;
  maximumDate: Date;
  onChange: (value: string) => void;
  /**
   * A SwiftUI view must live inside a Host. Inside `NativeList` the list's Host already
   * exists; anywhere else (onboarding's step) the picker hosts itself. `Host matchContents`
   * collapses inside a ScrollView (the ADR 0019 mount check), so the standalone host takes an
   * explicit row height that follows the text scale.
   */
  standalone?: boolean;
  testID: string;
  value: string | null;
}>;

const STANDALONE_ROW_HEIGHT = 48;

function calendarDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function isoCalendarDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function NativeDatePicker({
  accessibilityLabel,
  maximumDate,
  onChange,
  standalone = false,
  testID,
  value,
}: NativeDatePickerProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const selection = calendarDate(value, maximumDate);
  const colorScheme = theme.isDark ? 'dark' : 'light';
  const hostStyle = { height: STANDALONE_ROW_HEIGHT * Math.min(fontScale, 2) };

  if (swiftUI && NativeSwiftDatePicker) {
    const picker = (
      <NativeSwiftDatePicker
        displayedComponents={['date']}
        modifiers={standalone ? [tint(theme.colors.brandPrimary)] : undefined}
        onDateChange={(date) => onChange(isoCalendarDate(date))}
        range={{ end: maximumDate }}
        selection={selection}
        testID={testID}
        title={accessibilityLabel}
      />
    );
    return standalone ? (
      <swiftUI.Host colorScheme={colorScheme} style={hostStyle}>{picker}</swiftUI.Host>
    ) : picker;
  }

  if (NativeAndroidDatePicker) {
    const picker = (
      <View accessibilityLabel={accessibilityLabel} accessible testID={testID}>
        <NativeAndroidDatePicker
          displayedComponents="date"
          initialDate={selection.toISOString()}
          onDateSelected={(date) => onChange(isoCalendarDate(date))}
          selectableDates={{ end: maximumDate }}
        />
      </View>
    );
    return standalone ? (
      <UniversalHost colorScheme={colorScheme} style={hostStyle}>{picker}</UniversalHost>
    ) : picker;
  }

  return null;
}
