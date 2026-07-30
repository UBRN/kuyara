import { type PropsWithChildren, useMemo } from 'react';

import type { LanguagePreference } from '@/domain/preferences';
import { getDeviceLocale } from '@/localization/device-locale';
import { resolveLanguagePreference } from '@/localization/language-preference';
import {
  LocalizationContext,
  type LocalizationValue,
} from '@/localization/localization-context';
import { getMessages } from '@/localization/messages';

type LocalizationProviderProps = PropsWithChildren<{
  preference?: LanguagePreference;
}>;

export function LocalizationProvider({
  children,
  preference = 'system',
}: LocalizationProviderProps) {
  const localization = useMemo<LocalizationValue>(() => {
    const language = resolveLanguagePreference(preference, getDeviceLocale());
    return { language, messages: getMessages(language) };
  }, [preference]);

  return (
    <LocalizationContext value={localization}>{children}</LocalizationContext>
  );
}
