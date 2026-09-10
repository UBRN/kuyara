import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { FailureCategory } from '@/domain/failure-category';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import type { ErrorSurface } from '@/features/analytics/domain/analytics-events';
import { failureCategoryProperty } from '@/features/analytics/domain/analytics-mappers';

// `undefined` means the surface is between outcomes, so a loading state cannot report a
// recovery. `null` means a successful renderable state has landed.
export function useFocusedErrorEpisode(
  surface: ErrorSurface,
  failure: FailureCategory | null | undefined,
): void {
  const { errorEpisodes } = useProductAnalytics();
  const isFocused = useIsFocused();
  const shownFailureRef = useRef<FailureCategory | null>(null);

  useEffect(() => {
    if (!isFocused) {
      shownFailureRef.current = null;
      return;
    }
    if (failure === undefined) return;
    if (failure) {
      if (shownFailureRef.current === failure) return;
      shownFailureRef.current = failure;
      errorEpisodes.failed({
        surface,
        failureCategory: failureCategoryProperty(failure),
      });
      return;
    }
    if (!shownFailureRef.current) return;
    errorEpisodes.recovered({
      surface,
      failureCategory: failureCategoryProperty(shownFailureRef.current),
    });
    shownFailureRef.current = null;
  }, [errorEpisodes, failure, isFocused, surface]);
}
