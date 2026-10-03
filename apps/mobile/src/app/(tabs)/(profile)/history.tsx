import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useTransitionLanded } from '@/components/ui';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { weekSummary } from '@/features/recommendation/domain/outfit-history-week';
import { HistoryScreen, type HistoryEntry } from '@/features/profile/presentation/history-screen';
import { useMessages } from '@/localization/use-messages';

export default function HistoryRoute() {
  const messages = useMessages();
  const { dressingDayKey, outfitHistory, reevaluateLocalDay } = useRecommendationApplication();
  const [entries, setEntries] = useState<readonly HistoryEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const transitionLanded = useTransitionLanded();
  const router = useRouter();
  // The dressing day the application already read from the device clock: on Sunday evening
  // History opens with the week's look back, derived from the days on screen.
  const summary = useMemo(
    () => (entries && dressingDayKey ? weekSummary(entries, dressingDayKey) : null),
    [dressingDayKey, entries],
  );

  // Opening History reads the clock again, as Today does, so Sunday 18:00 is seen on arrival.
  useFocusEffect(useCallback(() => { reevaluateLocalDay(); }, [reevaluateLocalDay]));
  useFocusEffect(useCallback(() => {
    if (!outfitHistory) return;
    let live = true;
    void outfitHistory.list().then(
      (records) => {
        if (!live) return;
        setEntries(records.map(({ dayKey, outfit, pieceColors }) => ({ dayKey, outfit, pieceColors })));
        setLoadFailed(false);
      },
      () => { if (live) setLoadFailed(true); },
    );
    return () => { live = false; };
  }, [outfitHistory]));

  return (
    <>
      {/* ADR 0028: History is a pushed Profile screen with a native large title and the
          platform's back to Profile, as the Closet list is. */}
      <Stack.Screen
        options={{ headerLargeTitle: true, headerShown: true, headerTitle: messages.profile.historyLabel }}
      />
      <HistoryScreen entries={entries} loadFailed={loadFailed} onOpenToday={() => router.navigate('/')}
        transitionLanded={transitionLanded} weekSummary={summary} />
    </>
  );
}
