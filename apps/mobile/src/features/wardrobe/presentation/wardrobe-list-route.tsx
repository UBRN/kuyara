import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import {
  ANALYTICS_SCHEMA_VERSION,
  type CountBucket,
} from '@/features/analytics/domain/analytics-events';
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
  const { analytics, firstUses, retries } = useProductAnalytics();
  const { refresh, resolvePhotoUri, state } = useWardrobeApplication();
  const pendingRetryRef = useRef<PendingRetry | null>(null);
  const stateStatusRef = useRef(state.status);

  useEffect(() => {
    stateStatusRef.current = state.status;
  }, [state.status]);

  useScreenViewed('closet_list');

  useFocusEffect(
    useCallback(() => {
      if (stateStatusRef.current === 'ready') {
        void refresh();
      }
      return () => {
        // Taxonomy 5.7/6: the retry counter and any outcome still in flight belong to
        // this focus episode only.
        retries.reset('closet');
        pendingRetryRef.current = null;
      };
    }, [refresh, retries]),
  );

  useFocusedErrorEpisode(
    'closet',
    state.status === 'loading'
      ? undefined
      : state.status === 'error'
        ? 'unknown'
        : state.refreshFailure,
  );

  useEffect(() => {
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
  }, [analytics, firstUses, retries, state]);

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
