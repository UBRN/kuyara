import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';

import { plateTheme } from './theme';
import { KuyaraThemeContext, useKuyaraTheme } from './theme-context';

/** What it wraps stands on the garment plate `color` (see `plateTheme`). */
export function OnPlate({ color, children }: PropsWithChildren<{ color: string }>) {
  const theme = useKuyaraTheme();
  return <KuyaraThemeContext value={plateTheme(theme, color)}>{children}</KuyaraThemeContext>;
}

/** A view painted in the garment plate `color`, whose content stands on it. */
export function PlateView({ color, style, ...props }: ViewProps & Readonly<{ color: string; ref?: React.Ref<View> }>) {
  return (
    <OnPlate color={color}>
      <View {...props} style={[style, { backgroundColor: color }]} />
    </OnPlate>
  );
}
