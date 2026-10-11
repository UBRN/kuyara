import { Host as UniversalHost } from '@expo/ui';
import { datePickerStyle, environment, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { Platform, View } from 'react-native';

import { useTextScaling } from '@/components/ui/use-text-scaling';
import {
  calendarDateUtcMidnight,
  formatCalendarDate,
  formatCalendarDateParts,
  parseCalendarDate,
} from '@/domain/calendar-date';
import type { SupportedLanguage } from '@/localization/messages';
import { localeTag } from '@/localization/locale-tag';
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
   * The calendar date the picker stands on while `value` is null, so an unset picker never
   * shows a date that reads as chosen. Standing on it stores nothing: iOS reports only a date
   * the person turned to, and the date Android reports as it opens is ignored.
   */
  initialSelection: string;
  /**
   * The app's resolved language. SwiftUI reads the device locale by default, which
   * printed a device-formatted date inside a Turkish app; the picker follows the app
   * instead. Callers pass what they already resolved, so this adds no second source of
   * truth. Compose takes its locale from the Android configuration and exposes no
   * equivalent prop, so the Android branch is unaffected.
   */
  language: SupportedLanguage;
  maximumDate: Date;
  /** The earliest selectable date; without it the wheel scrolls back without limit. */
  minimumDate: Date;
  onChange: (value: string) => void;
  /**
   * A SwiftUI view must live inside a Host. Inside `NativeList` the list's Host already
   * exists; anywhere else (onboarding's step) the picker hosts itself. `Host matchContents`
   * collapses inside a ScrollView (the ADR 0019 mount check), so the standalone host takes an
   * explicit height.
   */
  standalone?: boolean;
  testID: string;
  value: string | null;
}>;

const STANDALONE_ROW_HEIGHT = 48;
// The system wheel's own height; it does not grow with the text size.
const WHEEL_HEIGHT = 216;

/** The calendar day of a Compose date, which is a UTC midnight. */
const composeCalendarDate = (date: Date) => formatCalendarDateParts({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

/**
 * The system birth date picker. On iOS it is the wheel: the whole date turns in place, so a
 * birth year decades back is a flick away rather than a page of calendar months, and its label
 * is the caller's own visible text.
 */
export function NativeDatePicker({
  accessibilityLabel,
  initialSelection,
  language,
  maximumDate,
  minimumDate,
  onChange,
  standalone = false,
  testID,
  value,
}: NativeDatePickerProps) {
  const theme = useKuyaraTheme();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const shown = value ?? initialSelection;
  const colorScheme = theme.isDark ? 'dark' : 'light';

  if (swiftUI && NativeSwiftDatePicker) {
    // The one English convention every other date uses (day before month, Monday first), as
    // the native identifier: the modifier applies a value only when `Locale.availableIdentifiers`
    // holds it, which lists `en_GB` and `tr_TR` but neither the hyphenated tags nor a bare `en`
    // that would draw the US convention. An unknown value is ignored by the native modifier.
    const locale = localeTag(language).replace('-', '_');
    const modifiers = [
      environment('locale', locale),
      datePickerStyle('wheel'),
      labelsHidden(),
      ...(standalone ? [tint(theme.colors.brandPrimary)] : []),
    ];
    const picker = (
      <NativeSwiftDatePicker
        displayedComponents={['date']}
        modifiers={modifiers}
        onDateChange={(date) => onChange(formatCalendarDate(date))}
        range={{ start: minimumDate, end: maximumDate }}
        selection={parseCalendarDate(shown)}
        testID={testID}
        title={accessibilityLabel}
      />
    );
    return standalone ? (
      <swiftUI.Host colorScheme={colorScheme} style={{ height: WHEEL_HEIGHT }}>
        {picker}
      </swiftUI.Host>
    ) : picker;
  }

  if (NativeAndroidDatePicker) {
    const picker = (
      <View accessibilityLabel={accessibilityLabel} accessible testID={testID}>
        <NativeAndroidDatePicker
          displayedComponents="date"
          initialDate={calendarDateUtcMidnight(shown).toISOString()}
          // Compose reports the date it opens on as soon as it is drawn; that is not a choice.
          onDateSelected={(date) => {
            const picked = composeCalendarDate(date);
            if (picked !== shown) onChange(picked);
          }}
          selectableDates={{ start: minimumDate, end: maximumDate }}
        />
      </View>
    );
    return standalone ? (
      <UniversalHost
        colorScheme={colorScheme}
        style={{
          height: STANDALONE_ROW_HEIGHT * Math.min(fontScale, 2) * (usesStackedLayout ? 2 : 1),
        }}>
        {picker}
      </UniversalHost>
    ) : picker;
  }

  return null;
}
