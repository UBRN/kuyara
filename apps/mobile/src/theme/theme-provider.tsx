import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance } from 'react-native';

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
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) {
        setIsReduceMotionEnabled(isEnabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setIsReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const theme = useMemo(
    () =>
      createKuyaraTheme(
        resolveColorScheme(preference, systemColorScheme),
        isReduceMotionEnabled,
      ),
    [isReduceMotionEnabled, preference, systemColorScheme],
  );

  return <KuyaraThemeContext value={theme}>{children}</KuyaraThemeContext>;
}
