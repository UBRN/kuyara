import { useMemo } from 'react';

import { getDeviceLocale } from '@/localization/device-locale';
import { getMessages, resolveSupportedLanguage } from '@/localization/messages';

export function useLocalization() {
  return useMemo(() => {
    const locale = getDeviceLocale();

    return {
      language: resolveSupportedLanguage(locale),
      messages: getMessages(locale),
    } as const;
  }, []);
}

export function useMessages() {
  return useLocalization().messages;
}
