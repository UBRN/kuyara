import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';

import { EasierToSeeContext, SystemVisibilityContext, type SystemVisibility } from '@/theme/easier-to-see';
import { KuyaraThemeContext } from '@/theme/theme-context';
import {
  createKuyaraTheme,
  resolveColorScheme,
  type SystemColorScheme,
  type ThemePreference,
} from '@/theme/theme';

type KuyaraThemeProviderProps = PropsWithChildren<{
  preference?: ThemePreference;
  /** O13: the profile's "Easier to see" switch. */
  easierToSee?: boolean;
}>;

export function KuyaraThemeProvider({
  children,
  easierToSee = false,
  preference = 'system',
}: KuyaraThemeProviderProps) {
  const systemColorScheme = useColorScheme() as SystemColorScheme;
  const systemVisibility = useReadSystemVisibility();

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const theme = useMemo(
    () =>
      createKuyaraTheme(resolveColorScheme(preference, systemColorScheme)),
    [preference, systemColorScheme],
  );

  return (
    <KuyaraThemeContext value={theme}>
      <EasierToSeeContext value={easierToSee}>
        <SystemVisibilityContext value={systemVisibility}>{children}</SystemVisibilityContext>
      </EasierToSeeContext>
    </KuyaraThemeContext>
  );
}

// O13: iOS Bold Text and Increase Contrast, followed through their change
// events and read once at mount. A change event is newer than any initial read still in
// flight, so an initial read that resolves after one never overwrites it. Android reports
// neither here, so both stay off there.
function useReadSystemVisibility(): SystemVisibility {
  const [visibility, setVisibility] = useState<SystemVisibility>({ boldText: false, increaseContrast: false });

  useEffect(() => {
    let active = true;
    const changed = { boldText: false, increaseContrast: false };
    const set = (key: keyof SystemVisibility, value: boolean) => {
      if (active) setVisibility((current) => current[key] === value ? current : { ...current, [key]: value });
    };
    const onChange = (key: keyof SystemVisibility) => (value: boolean) => {
      changed[key] = true;
      set(key, value);
    };
    const onInitialRead = (key: keyof SystemVisibility) => (value: boolean) => {
      if (!changed[key]) set(key, value);
    };
    const bold = AccessibilityInfo.addEventListener('boldTextChanged', onChange('boldText'));
    const contrast = AccessibilityInfo.addEventListener('darkerSystemColorsChanged', onChange('increaseContrast'));
    void AccessibilityInfo.isBoldTextEnabled?.().then(onInitialRead('boldText'), () => undefined);
    void AccessibilityInfo.isDarkerSystemColorsEnabled?.().then(onInitialRead('increaseContrast'), () => undefined);
    return () => {
      active = false;
      bold?.remove();
      contrast?.remove();
    };
  }, []);

  return visibility;
}
