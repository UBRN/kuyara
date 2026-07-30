import { Redirect, useRouter } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { resolveProfileHomeRoute } from '@/features/profile/application/profile-route-gate';
import { canonicalTodayScreenState } from '@/features/today/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();
  const { state } = useProfileApplication();
  const router = useRouter();

  if (state.status !== 'ready') {
    return null;
  }

  if (resolveProfileHomeRoute(state.profile) === 'onboarding') {
    return <Redirect href="/onboarding" />;
  }

  return (
    <TodayScreen
      language={language}
      onOpenSettings={() => router.push('/settings')}
      state={canonicalTodayScreenState}
    />
  );
}
