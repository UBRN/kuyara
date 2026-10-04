import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AccountScreensPort } from '@/features/account/application/account-screens';
import { AccountScreensContext } from '@/features/account/application/account-screens-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

/** An account screen on an iPhone-sized safe area, in `language`, over `port`. */
export function renderWith(port: AccountScreensPort, element: ReactElement, language: SupportedLanguage = 'en'): Promise<RenderResult> {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <AccountScreensContext.Provider value={port}>{element}</AccountScreensContext.Provider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>,
  );
}
