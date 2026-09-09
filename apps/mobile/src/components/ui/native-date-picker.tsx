import { Host as UniversalHost } from '@expo/ui';
import { environment, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import type { SupportedLanguage } from '@/localization/messages';
import { spacing } from '@/theme/theme';
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
  /**
   * The app's resolved language. SwiftUI reads the device locale by default, which
   * printed a device-formatted date inside a Turkish app; the picker follows the app
   * instead. Callers pass what they already resolved, so this adds no second source of
   * truth. Compose takes its locale from the Android configuration and exposes no
   * equivalent prop, so the Android branch is unaffected.
   */
  language: SupportedLanguage;
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
  language,
  maximumDate,
  onChange,
  standalone = false,
  testID,
  value,
}: NativeDatePickerProps) {
  const theme = useKuyaraTheme();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const selection = calendarDate(value, maximumDate);
  const colorScheme = theme.isDark ? 'dark' : 'light';
  const standaloneRowHeight = STANDALONE_ROW_HEIGHT * Math.min(fontScale, 2);

  if (swiftUI && NativeSwiftDatePicker) {
    // `Locale.availableIdentifiers` holds the bare `en` / `tr` identifiers, which is what
    // `SupportedLanguage` already is; an unknown value is ignored by the native modifier.
    const modifiers = standalone
      ? [
          environment('locale', language),
          ...(usesStackedLayout ? [labelsHidden()] : []),
          tint(theme.colors.brandPrimary),
        ]
      : [environment('locale', language)];
    const picker = (
      <NativeSwiftDatePicker
        displayedComponents={['date']}
        modifiers={modifiers}
        onDateChange={(date) => onChange(isoCalendarDate(date))}
        range={{ end: maximumDate }}
        selection={selection}
        testID={testID}
        title={accessibilityLabel}
      />
    );
    if (!standalone) return picker;

    const host = (
      <swiftUI.Host colorScheme={colorScheme} style={{ height: standaloneRowHeight }}>
        {picker}
      </swiftUI.Host>
    );
    return usesStackedLayout ? (
      <View>
        <AppText
          accessibilityElementsHidden
          colorRole="textPrimary"
          importantForAccessibility="no-hide-descendants"
          style={styles.standaloneTitle}
          variant="body">
          {accessibilityLabel}
        </AppText>
        {host}
      </View>
    ) : host;
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
      <UniversalHost
        colorScheme={colorScheme}
        style={{
          height: standaloneRowHeight * (usesStackedLayout ? 2 : 1),
        }}>
        {picker}
      </UniversalHost>
    ) : picker;
  }

  return null;
}

const styles = StyleSheet.create({
  standaloneTitle: {
    marginBottom: spacing.sm,
  },
});
