import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import {
  ANALYTICS_SCHEMA_VERSION,
  type CountBucket,
} from '@/features/analytics/domain/analytics-events';
import { useSingleTap, type SingleTap } from '@/components/ui/use-single-push';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { useClosetWearCounts } from '@/features/wardrobe/application/use-closet-wear-counts';
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
  initialCategory,
  onCategoryInView,
  revealWanted = false,
  savedItemId,
  singleTap,
  transitionLanded,
}: Readonly<{
  initialCategory?: StructuralCategory;
  onCategoryInView?: (category: StructuralCategory) => void;
  revealWanted?: boolean;
  savedItemId?: string | null;
  /**
   * The Closet route's own guard, so its plus button, the list's add action and every tile
   * open one screen between them however quickly they are pressed together.
   */
  singleTap?: SingleTap;
  transitionLanded?: boolean;
}> = {}) {
  const router = useRouter();
  const ownTap = useSingleTap();
  const tap = singleTap ?? ownTap;
  const { analytics, firstUses, retries } = useProductAnalytics();
  const { refresh, resolvePhotoUri, softDeleteItem, state } = useWardrobeApplication();
  const wornCounts = useClosetWearCounts();
  const pendingRetryRef = useRef<PendingRetry | null>(null);
  const stateStatusRef = useRef(state.status);

  useEffect(() => {
    stateStatusRef.current = state.status;
  }, [state.status]);

  useScreenViewed('closet_list');
  useScreenInteractive(state.status === 'ready' ? { state: 'ready' } : null);

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
      wornCounts={wornCounts}
      initialCategory={initialCategory}
      // The category lives on the route, so the plus bar button in the route file reads
      // the same value this add action sends, and the form opens its type chooser on the
      // category the user is looking at.
      onAdd={(category) =>
        tap.push({
          params: { category },
          pathname: '/wardrobe/new',
        })
      }
      onCategoryChange={(category) => router.setParams({ category })}
      onCategoryInView={onCategoryInView}
      itemHref={(id) => `/wardrobe/${id}`}
      onItemPress={tap.linkPress}
      onRetry={handleRetry}
      // O10's Undo removes the piece just saved, as Delete would; it emits no analytics
      // event of its own (no event change here).
      onUndoSaved={async (id) => {
        await softDeleteItem(id);
      }}
      resolvePhotoUri={resolvePhotoUri}
      revealWanted={revealWanted}
      savedItemId={savedItemId}
      state={state}
      transitionLanded={transitionLanded}
    />
  );
}
