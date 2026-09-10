import type { FeatureName } from '@/features/analytics/domain/analytics-events';
import type { FirstUseStore } from '@/features/analytics/domain/first-use-store';

export class InMemoryFirstUseStore implements FirstUseStore {
  private readonly used = new Set<FeatureName>();

  constructor(features: readonly FeatureName[] = []) {
    features.forEach((feature) => this.used.add(feature));
  }

  has(feature: FeatureName): Promise<boolean> {
    return Promise.resolve(this.used.has(feature));
  }

  markUsed(feature: FeatureName): Promise<void> {
    this.used.add(feature);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.used.clear();
    return Promise.resolve();
  }
}
