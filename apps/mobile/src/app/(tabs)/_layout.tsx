import { Redirect } from 'expo-router';

import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { AccountSheet } from '@/features/account/presentation/account-sheet';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { resolveProfileHomeRoute } from '@/features/profile/application/profile-route-gate';
import { PrimaryTabs } from '@/navigation/primary-tabs';

export default function PrimaryTabsRouteLayout() {
  const { state } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  if (resolveProfileHomeRoute(state.profile) === 'onboarding') {
    return <Redirect href="/onboarding" />;
  }

  return (
    <>
      <PrimaryTabs />
      {/* The account deletion result shows over whichever tab the person is on (ADR 0041 section 7). */}
      {ACCOUNT_SCREENS_ENABLED ? <AccountSheet host="app" /> : null}
    </>
  );
}
