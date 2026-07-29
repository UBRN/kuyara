import { useMemo } from 'react';

import { getDeviceLocale } from '@/localization/device-locale';
import { getMessages } from '@/localization/messages';

export function useMessages() {
  return useMemo(() => getMessages(getDeviceLocale()), []);
}
