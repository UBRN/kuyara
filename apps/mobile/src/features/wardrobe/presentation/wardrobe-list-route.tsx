import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import {
  ANALYTICS_SCHEMA_VERSION,
  type CountBucket,
  type FailureCategoryProperty,
} from '@/features/analytics/domain/analytics-events';
import { failureCategoryProperty } from '@/features/analytics/domain/analytics-mappers';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeListScreen,
  type WardrobeRetrySource,
} from '@/features/wardrobe/presentation/wardrobe-list-screen';

// One pending retry/refresh at a time: the outcome is read from `state` on the next
// render after `refresh()` settles, since a function created during this render would
// otherwise close over the `state` that was current when the user pressed the control,
// not the one `refresh()` actually produced.
type PendingRetry = Readonly<{
  source: WardrobeRetrySource;
  attemptNumber: CountBucket | null;
}>;

export function WardrobeListRoute({
  initialEntryState,
}: Readonly<{ initialEntryState?: WardrobeEntryState }> = {}) {
  const router = useRouter();
  const { analytics, errorEpisodes, firstUses, retries } = useProductAnalytics();
  const { refresh, resolvePhotoUri, state } = useWardrobeApplication();
  const lastFailureRef = useRef<FailureCategoryProperty | null>(null);
  const pendingRetryRef = useRef<PendingRetry | null>(null);

  useScreenViewed('closet_list');

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'ready') {
        void refresh();
      }
      return () => {
        // Taxonomy 5.7/6: the retry counter and any outcome still in flight belong to
        // this focus episode only.
        retries.reset('closet');
        pendingRetryRef.current = null;
      };
    }, [refresh, retries, state.status]),
  );

  useEffect(() => {
    if (state.status === 'ready') {
      const failure = state.refreshFailure;
      if (failure) {
        const category = failureCategoryProperty(failure);
        errorEpisodes.failed({ surface: 'closet', failureCategory: category });
        lastFailureRef.current = category;
      } else if (lastFailureRef.current) {
        errorEpisodes.recovered({
          surface: 'closet',
          failureCategory: lastFailureRef.current,
        });
        lastFailureRef.current = null;
      }
    }

    // `loading` is a transient state between the pending action and its outcome.
    if (state.status === 'loading') {
      return;
    }

    const pending = pendingRetryRef.current;
    if (!pending) {
      return;
    }
    pendingRetryRef.current = null;
    const succeeded = state.status === 'ready' && state.refreshFailure === null;

    if (pending.source === 'pull') {
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'closet',
        result: succeeded ? 'success' : 'failure_kept_last_known',
      });
      // `markFirstUse` only reports whether this is the first use; the caller decides
      // whether to actually capture `feature_used_first_time` (taxonomy 5.11).
      void firstUses.markFirstUse('manual_refresh').then((isFirstUse) => {
        if (isFirstUse) {
          analytics.capture('feature_used_first_time', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            feature_name: 'manual_refresh',
          });
        }
      });
      return;
    }

    analytics.capture('retry_after_failure_triggered', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface: 'closet',
      attempt_number: pending.attemptNumber ?? 1,
      result: succeeded ? 'success' : 'failure',
    });
    if (succeeded) {
      retries.reset('closet');
    }
  }, [analytics, errorEpisodes, firstUses, retries, state]);

  const handleRetry = (source: WardrobeRetrySource) => {
    pendingRetryRef.current = {
      source,
      attemptNumber: source === 'retry_button' ? retries.nextAttempt('closet') : null,
    };
    void refresh();
  };

  return (
    <WardrobeListScreen
      initialEntryState={initialEntryState}
      onAdd={() => router.push('/wardrobe/new')}
      onEdit={(id) => router.push(`/wardrobe/${id}`)}
      onRetry={handleRetry}
      resolvePhotoUri={resolvePhotoUri}
      state={state}
    />
  );
}
