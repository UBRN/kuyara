import type { FeatureName } from '@/features/analytics/domain/analytics-events';
import type { FirstUseStore } from '@/features/analytics/domain/first-use-store';

export class FirstUseTracker {
  private pending: Promise<void> = Promise.resolve();
  private readonly store: FirstUseStore;

  constructor(store: FirstUseStore) {
    this.store = store;
  }

  markFirstUse(feature: FeatureName): Promise<boolean> {
    const result = this.pending.then(async () => {
      if (await this.store.has(feature)) return false;
      await this.store.markUsed(feature);
      return true;
    });
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  clear(): Promise<void> {
    const result = this.pending.then(() => this.store.clear());
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
