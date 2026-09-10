import { Directory, File, Paths } from 'expo-file-system';

import type { FeatureName } from '@/features/analytics/domain/analytics-events';
import type { FirstUseStore } from '@/features/analytics/domain/first-use-store';

const featureNames = {
  closet: true,
  manual_refresh: true,
  ai_status_probe: true,
  location_override: true,
  appearance_override: true,
  language_override: true,
  notifications: true,
} as const satisfies Record<FeatureName, true>;

const directorySegments = ['kuyara', 'analytics'] as const;
const fileName = 'first-uses.json';

function isFeatureName(value: unknown): value is FeatureName {
  return typeof value === 'string' && value in featureNames;
}

export class ExpoFileFirstUseStore implements FirstUseStore {
  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  private async read(): Promise<Set<FeatureName>> {
    const file = this.file();
    if (!file.exists) return new Set();

    try {
      const parsed: unknown = JSON.parse(await file.text());
      return Array.isArray(parsed) && parsed.every(isFeatureName)
        ? new Set(parsed)
        : new Set();
    } catch {
      return new Set();
    }
  }

  async has(feature: FeatureName): Promise<boolean> {
    return (await this.read()).has(feature);
  }

  async markUsed(feature: FeatureName): Promise<void> {
    const used = await this.read();
    used.add(feature);
    new Directory(Paths.document, ...directorySegments).create({
      idempotent: true,
      intermediates: true,
    });
    this.file().write(JSON.stringify([...used].sort()));
  }

  async clear(): Promise<void> {
    const file = this.file();
    if (file.exists) file.delete();
  }
}
