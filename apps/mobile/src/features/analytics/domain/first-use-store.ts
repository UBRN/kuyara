import type { FeatureName } from '@/features/analytics/domain/analytics-events';

export interface FirstUseStore {
  has(feature: FeatureName): Promise<boolean>;
  markUsed(feature: FeatureName): Promise<void>;
  // Taxonomy 5.11: the set is cleared when the analytics identity is severed on withdrawal,
  // so a re-consented install reports first use again on its new identity.
  clear(): Promise<void>;
}
