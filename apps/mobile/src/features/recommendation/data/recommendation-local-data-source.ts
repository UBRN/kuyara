export type RecommendationSnapshotRecord = Readonly<{
  id: string;
  localProfileId: string;
  weatherSnapshotId: string;
  locationKey: string;
  generationMode: string;
  contextJson: string;
  outfitsJson: string;
  createdAt: string;
  updatedAt: string;
}>;

export interface RecommendationLocalDataSource {
  getSnapshot(localProfileId: string): Promise<RecommendationSnapshotRecord | null>;
  replaceSnapshot(record: RecommendationSnapshotRecord): Promise<RecommendationSnapshotRecord>;
}

export class RecommendationDataSourceError extends Error {
  constructor() {
    super('The local recommendation data operation failed.');
    this.name = 'RecommendationDataSourceError';
  }
}
