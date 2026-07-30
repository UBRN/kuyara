import { canonicalTodayScreenState } from '@/features/today/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();

  return <TodayScreen language={language} state={canonicalTodayScreenState} />;
}
