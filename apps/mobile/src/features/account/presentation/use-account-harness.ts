import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { accountScenarios, isAccountScenarioName } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';

/**
 * Development only: `?accountScenario=<name>` on an account route loads that frame's state
 * into the in-memory port, so every approved frame can be opened by link in the Simulator
 * (for example `kuyara://settings/account?accountScenario=offline`). Release builds ignore it.
 */
export function useAccountHarness() {
  const { accountScenario } = useLocalSearchParams<{ accountScenario?: string }>();
  const { port } = useAccountScreens();
  useEffect(() => {
    if (__DEV__ && isAccountScenarioName(accountScenario)) port.load(accountScenarios[accountScenario]);
  }, [accountScenario, port]);
}
