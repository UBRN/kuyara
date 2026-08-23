import { createContext, use } from 'react';

import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';

export type RecommendationApplicationValue = Readonly<{
  state: RecommendationApplicationState;
  refresh: () => Promise<RecommendationSnapshot | null>;
}>;

export const RecommendationApplicationContext =
  createContext<RecommendationApplicationValue | null>(null);

export function useRecommendationApplication(): RecommendationApplicationValue {
  const value = use(RecommendationApplicationContext);
  if (!value) {
    throw new Error(
      'useRecommendationApplication must be used within RecommendationApplicationProvider',
    );
  }
  return value;
}
