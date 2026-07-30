import type { WardrobeItemRecord } from '@/features/wardrobe/data/wardrobe-item-record';

export type CreateWardrobeItemRecord = WardrobeItemRecord;

export type UpdateWardrobeItemRecord = Readonly<{
  id: string;
  localProfileId: string;
  name: string | null;
  category: string;
  garmentTypeId: string | null;
  color: string | null;
  colorFamily: string | null;
  thermalLevelOverride: string | null;
  waterProtectionOverride: string | null;
  windProtectionOverride: string | null;
  breathabilityOverride: string | null;
  armCoverageOverride: string | null;
  legCoverageOverride: string | null;
  tractionSuitabilityOverride: string | null;
  photoRelativePath: string | null;
  updatedAt: string;
}>;

export interface WardrobeLocalDataSource {
  createItem(record: CreateWardrobeItemRecord): Promise<WardrobeItemRecord>;
  getActiveItem(localProfileId: string, id: string): Promise<WardrobeItemRecord | null>;
  getItemIncludingDeleted(
    localProfileId: string,
    id: string,
  ): Promise<WardrobeItemRecord | null>;
  listActiveItems(localProfileId: string): Promise<WardrobeItemRecord[]>;
  updateActiveItem(record: UpdateWardrobeItemRecord): Promise<WardrobeItemRecord | null>;
  softDeleteActiveItem(
    localProfileId: string,
    id: string,
    deletedAt: string,
  ): Promise<WardrobeItemRecord | null>;
}

export class WardrobeDataSourceError extends Error {
  readonly code: 'write-failed';

  constructor(code: 'write-failed') {
    super('The local wardrobe data operation failed.');
    this.name = 'WardrobeDataSourceError';
    this.code = code;
  }
}
