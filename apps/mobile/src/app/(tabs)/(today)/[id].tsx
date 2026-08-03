import { useLocalSearchParams, useRouter } from 'expo-router';

import { canonicalTodayScreenState } from '@/features/today/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { useLocalization } from '@/localization/use-messages';

export default function OutfitDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { language, messages } = useLocalization();
  const router = useRouter();
  const suggestionId = Array.isArray(id) ? id[0] : id;

  return (
    <OutfitDetailScreen
      backLabel={`← ${messages.today.title}`}
      language={language}
      onBack={() => router.back()}
      state={canonicalTodayScreenState}
      suggestionId={suggestionId}
    />
  );
}
