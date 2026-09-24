import { type PropsWithChildren, useEffect, useMemo } from 'react';
import { Appearance } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import {
  createKuyaraTheme,
  resolveColorScheme,
  type SystemColorScheme,
  type ThemePreference,
} from '@/theme/theme';

type KuyaraThemeProviderProps = PropsWithChildren<{
  preference?: ThemePreference;
}>;

export function KuyaraThemeProvider({
  children,
  preference = 'system',
}: KuyaraThemeProviderProps) {
  const systemColorScheme = useColorScheme() as SystemColorScheme;

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const theme = useMemo(
    () =>
      createKuyaraTheme(resolveColorScheme(preference, systemColorScheme)),
    [preference, systemColorScheme],
  );

  return <KuyaraThemeContext value={theme}>{children}</KuyaraThemeContext>;
}
