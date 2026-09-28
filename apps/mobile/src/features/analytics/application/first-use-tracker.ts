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
    // Best-effort: analytics bookkeeping must never reject into a caller that fires and
    // forgets it. A store failure reports "not a first use" and so emits no event.
    const result = this.pending.then(async () => {
      try {
        if (await this.store.has(feature)) return false;
        await this.store.markUsed(feature);
        return true;
      } catch {
        return false;
      }
    });
    this.pending = result.then(() => undefined);
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
