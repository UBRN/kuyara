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

/**
 * A garment drawing that stands straight on the page or on a card in the light appearance.
 * In the dark one it stands on the garment plate (`garmentTile`) instead, so a piece is never
 * drawn on a dark field; `style` shapes that plate and applies only there. The light
 * appearance renders the children alone, exactly as without the wrapper.
 */
export function DarkPlate({ style, children, testID }: PropsWithChildren<Pick<ViewProps, 'style' | 'testID'>>) {
  const theme = useKuyaraTheme();
  if (!theme.isDark) return children;
  return <PlateView color={theme.colors.garmentTile} style={style} testID={testID}>{children}</PlateView>;
}
