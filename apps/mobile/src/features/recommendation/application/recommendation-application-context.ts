import { createContext, use } from 'react';

import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';

export type RecommendationApplicationValue = Readonly<{
  state: RecommendationApplicationState;
  // ADR 0034 section 5: what the device reports about on-device selection, read once and
  // null until that answer arrives. No inference, no quota, no provider or model identity.
  onDeviceAvailability: OnDeviceAiAvailability | null;
  refresh: () => Promise<RecommendationSnapshot | null>;
  reevaluateLocalDay: () => void;
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
