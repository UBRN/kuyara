import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  syncSiriCardSwitch,
  type SiriCardSwitch,
  type SiriCardSwitchClient,
  type SiriCardSwitchStore,
} from '@/features/recommendation/application/siri-card-switch';

/**
 * ADR 0042 section 7: the Siri card switch, checked at launch and on each return to the
 * foreground (the check itself spaces the requests). Null until the stored value is read; on
 * without dependencies, where no card reads the summary.
 */
export function useSiriCardSwitch(dependencies: Readonly<{
  store: SiriCardSwitchStore;
  client: SiriCardSwitchClient;
  now: () => string;
}> | null): SiriCardSwitch | null {
  const [siriCard, setSiriCard] = useState<SiriCardSwitch | null>(dependencies ? null : 'on');
  useEffect(() => {
    if (!dependencies) return undefined;
    let active = true;
    let running = false;
    const sync = () => {
      if (running) return;
      running = true;
      void syncSiriCardSwitch({ ...dependencies, publish: (value) => { if (active) setSiriCard(value); } })
        .finally(() => { running = false; });
    };
    sync();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [dependencies]);
  return siriCard;
}
