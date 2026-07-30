import { Redirect } from 'expo-router';

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

  return <PrimaryTabs />;
}
