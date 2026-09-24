import { createContext, use } from 'react';

import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { DressStyle } from '@kuyara/contracts';
import type { DressingDayChoiceSource } from '@/features/recommendation/domain/dressing-day-choice';

export type RecommendationApplicationValue = Readonly<{
  state: RecommendationApplicationState;
  // ADR 0034 section 5: what the device reports about on-device selection, read once and
  // null until that answer arrives. No inference, no quota, no provider or model identity.
  onDeviceAvailability: OnDeviceAiAvailability | null;
  refresh: () => Promise<RecommendationSnapshot | null>;
  /**
   * Today's "show another outfit" action: it regenerates the recommendation and leaves
   * weather alone. Whether this one reaches the AI chain or composes from the validated
   * pool is decided behind this call; the caller neither knows nor shows it.
   */
  regenerate: () => Promise<RecommendationSnapshot | null>;
  dressingDayKey?: string;
  dressingDayChoiceReady?: boolean;
  morningChoicePending?: boolean;
  resolvedDressStyle?: DressStyle;
  chooseFormality?: (key: string, formality: DressStyle, source: DressingDayChoiceSource) => Promise<void>;
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
