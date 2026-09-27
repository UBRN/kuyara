import type { FeatureName } from '@/features/analytics/domain/analytics-events';
import type { FirstUseStore } from '@/features/analytics/domain/first-use-store';

export class FirstUseTracker {
  private pending: Promise<void> = Promise.resolve();
  private readonly store: FirstUseStore;
  private readonly isEnabled: () => boolean;

  constructor(store: FirstUseStore, isEnabled: () => boolean) {
    this.store = store;
    this.isEnabled = isEnabled;
  }

  markFirstUse(feature: FeatureName): Promise<boolean> {
    if (!this.isEnabled()) return Promise.resolve(false);
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
