import { SymbolView, type AndroidSymbol, type SymbolViewProps } from 'expo-symbols';

// `sf-symbols-typescript` is a transitive dependency, so it is not resolvable from this
// package under pnpm's strict layout. Derive the SF Symbol name union from the prop type
// `expo-symbols` already exports instead of importing the package directly.
type SFSymbol = Extract<SymbolViewProps['name'], string>;

type PlatformIconNames = Readonly<{
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
}>;

export const iconNames = Object.freeze({
  tabToday: { ios: 'house.fill', android: 'home', web: 'home' },
  tabWeather: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  tabProfile: { ios: 'person.fill', android: 'person', web: 'person' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  circle: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  heartFilled: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  wind: { ios: 'wind', android: 'air', web: 'air' },
  humidity: { ios: 'humidity.fill', android: 'water_drop', web: 'water_drop' },
  uv: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  error: { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' },
  theme: { ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' },
  language: { ios: 'globe', android: 'language', web: 'language' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
} as const satisfies Readonly<Record<string, PlatformIconNames & SymbolViewProps['name']>>);

export type IconName = keyof typeof iconNames;

type IconProps = Readonly<{
  name: IconName;
  size: number;
  color: string;
  accessibilityLabel?: string;
}>;

export function Icon({ accessibilityLabel, color, name, size }: IconProps) {
  return (
    <SymbolView
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no-hide-descendants'}
      name={iconNames[name]}
      size={size}
      tintColor={color}
    />
  );
}
