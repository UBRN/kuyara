import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { HistoryScreen, type HistoryEntry } from '@/features/profile/presentation/history-screen';
import { useMessages } from '@/localization/use-messages';

export default function HistoryRoute() {
  const messages = useMessages();
  const { outfitHistory } = useRecommendationApplication();
  const [entries, setEntries] = useState<readonly HistoryEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!outfitHistory) return;
    let live = true;
    void outfitHistory.list().then(
      (records) => { if (live) setEntries(records.map(({ dayKey, outfit }) => ({ dayKey, outfit }))); },
      () => { if (live) setLoadFailed(true); },
    );
    return () => { live = false; };
  }, [outfitHistory]);

  return (
    <>
      {/* ADR 0028: History is a pushed Profile screen with a native large title and the
          platform's back to Profile, as the Closet list is. */}
      <Stack.Screen
        options={{ headerLargeTitle: true, headerShown: true, headerTitle: messages.profile.historyLabel }}
      />
      <HistoryScreen entries={entries} loadFailed={loadFailed} />
    </>
  );
}
