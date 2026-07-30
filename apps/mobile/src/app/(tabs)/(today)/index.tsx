import { useRouter } from 'expo-router';

import { canonicalTodayScreenState } from '@/features/today/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();
  const router = useRouter();

  return (
    <TodayScreen
      language={language}
      onOpenSettings={() => router.push('/settings')}
      state={canonicalTodayScreenState}
    />
  );
}
