import { SymbolView, type AndroidSymbol, type SymbolViewProps } from 'expo-symbols';
import { Platform } from 'react-native';

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
  // The tab bar pairs each filled symbol with an outline one so that selection is not
  // signalled by colour alone (ADR 0027). The Android names are deliberately identical
  // to their filled entry: `AndroidSymbol` carries no filled counterpart for the weather
  // glyph, so Android keeps one icon per tab and lets the Material active indicator
  // carry the state instead.
  tabToday: { ios: 'house.fill', android: 'home', web: 'home' },
  tabTodayOutline: { ios: 'house', android: 'home', web: 'home' },
  tabWeather: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  tabWeatherOutline: { ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' },
  tabProfile: { ios: 'person.fill', android: 'person', web: 'person' },
  tabProfileOutline: { ios: 'person', android: 'person', web: 'person' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  menuIndicator: {
    ios: 'chevron.up.chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down',
  },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  appleIntelligence: { ios: 'apple.intelligence', android: 'auto_awesome', web: 'auto_awesome' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  star: { ios: 'star.fill', android: 'star', web: 'star' },
  document: { ios: 'doc.text', android: 'description', web: 'description' },
  statusRunning: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  statusOff: { ios: 'pause.circle', android: 'pause_circle', web: 'pause_circle' },
  statusUnavailable: { ios: 'xmark.circle', android: 'cancel', web: 'cancel' },
  clearCircleFilled: { ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' },
  info: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  help: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  circle: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  heartFilled: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  // O6, O7: the owned piece is a hanger; a worn day is a calendar with a check.
  hanger: { ios: 'hanger', android: 'checkroom', web: 'checkroom' },
  calendarCheck: { ios: 'calendar.badge.checkmark', android: 'event_available', web: 'event_available' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  // O5's leading button icons: each names its action faster than the words do.
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  photo: { ios: 'photo', android: 'image', web: 'image' },
  skipForward: { ios: 'forward.end', android: 'skip_next', web: 'skip_next' },
  wind: { ios: 'wind', android: 'air', web: 'air' },
  humidity: { ios: 'humidity.fill', android: 'water_drop', web: 'water_drop' },
  uv: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  error: { ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' },
  theme: { ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' },
  language: { ios: 'globe', android: 'language', web: 'language' },
  bell: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  clothing: { ios: 'tshirt', android: 'checkroom', web: 'checkroom' },
  // O14 Settings row anatomy A: every row glyph is the outline weight, and the morning
  // question takes its own symbol instead of sharing the birth date's calendar.
  bellOutline: { ios: 'bell', android: 'notifications', web: 'notifications' },
  helpOutline: { ios: 'questionmark.circle', android: 'help', web: 'help' },
  infoOutline: { ios: 'info.circle', android: 'info', web: 'info' },
  starOutline: { ios: 'star', android: 'star', web: 'star' },
  sunrise: { ios: 'sunrise', android: 'wb_twilight', web: 'wb_twilight' },
  precipitationChance: { ios: 'drop.fill', android: 'water_drop', web: 'water_drop' },
  // The eleven weather condition codes, filled because a forecast column reports an
  // active condition (Law 6). Material has no drizzle or heavy-rain counterpart of the
  // same idiom, so those take the nearest existing name. The three conditions that show
  // the sky itself carry a second, night form; the rest look the same at either hour.
  conditionClear: { ios: 'sun.max.fill', android: 'wb_sunny', web: 'wb_sunny' },
  conditionClearNight: { ios: 'moon.stars.fill', android: 'nights_stay', web: 'nights_stay' },
  conditionMostlyClear: { ios: 'sun.min.fill', android: 'sunny', web: 'sunny' },
  conditionMostlyClearNight: { ios: 'moon.fill', android: 'bedtime', web: 'bedtime' },
  conditionPartlyCloudy: {
    ios: 'cloud.sun.fill', android: 'partly_cloudy_day', web: 'partly_cloudy_day',
  },
  conditionPartlyCloudyNight: {
    ios: 'cloud.moon.fill', android: 'partly_cloudy_night', web: 'partly_cloudy_night',
  },
  conditionCloudy: { ios: 'cloud.fill', android: 'cloud', web: 'cloud' },
  conditionFog: { ios: 'cloud.fog.fill', android: 'foggy', web: 'foggy' },
  conditionDrizzle: { ios: 'cloud.drizzle.fill', android: 'grain', web: 'grain' },
  conditionRain: { ios: 'cloud.rain.fill', android: 'rainy', web: 'rainy' },
  conditionHeavyRain: { ios: 'cloud.heavyrain.fill', android: 'rainy_heavy', web: 'rainy_heavy' },
  conditionSleet: { ios: 'cloud.sleet.fill', android: 'weather_mix', web: 'weather_mix' },
  conditionSnow: { ios: 'cloud.snow.fill', android: 'weather_snowy', web: 'weather_snowy' },
  conditionThunderstorm: {
    ios: 'cloud.bolt.rain.fill', android: 'thunderstorm', web: 'thunderstorm',
  },
} as const satisfies Readonly<Record<string, PlatformIconNames & SymbolViewProps['name']>>);

export type IconName = keyof typeof iconNames;

/**
 * How a symbol is coloured. `tint` is the default one-ink rendering. `multicolor` is the
 * symbol's own original colours, and `palette` gives each layer one of the listed inks.
 * Both colourful renderings are iOS only: a tint would repaint them, so iOS draws them
 * without one, and Android, which has neither, keeps the single `color`.
 */
export type IconRendering = 'tint' | 'multicolor' | Readonly<{ palette: readonly string[] }>;

type IconProps = Readonly<{
  name: IconName;
  size: number;
  color: string;
  accessibilityLabel?: string;
  rendering?: IconRendering;
}>;

export function Icon({ accessibilityLabel, color, name, rendering = 'tint', size }: IconProps) {
  const colourful = rendering !== 'tint' && Platform.OS === 'ios';
  return (
    <SymbolView
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      colors={colourful && typeof rendering === 'object' ? [...rendering.palette] : undefined}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no-hide-descendants'}
      name={iconNames[name]}
      size={size}
      tintColor={colourful ? undefined : color}
      type={colourful ? (rendering === 'multicolor' ? 'multicolor' : 'palette') : undefined}
    />
  );
}
