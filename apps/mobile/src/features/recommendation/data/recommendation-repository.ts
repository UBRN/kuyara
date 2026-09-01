import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type {
  RecommendationLocalDataSource,
  RecommendationSnapshotRecord,
} from '@/features/recommendation/data/recommendation-local-data-source';
import {
  mapStoredRecommendation,
  parseRecommendationContext,
  toStoredRecommendationOutfits,
  type RecommendationContext,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';

export type RecommendationSnapshot = Readonly<{
  id: string;
  localProfileId: string;
  weatherSnapshotId: string;
  locationKey: string;
  clothingPreference: string;
  dayVariant: number | null;
  generationMode: RecommendationGenerationMode;
  recommendation: OutfitRecommendationSuccess;
  createdAt: string;
  updatedAt: string;
}>;

export type RecommendationSnapshotInput = Readonly<{
  weatherSnapshotId: string;
  locationKey: string;
  context: RecommendationContext;
  recommendation: OutfitRecommendationSuccess;
}>;

export interface RecommendationRepository {
  getSnapshot(localProfileId: string): Promise<RecommendationSnapshot | null>;
  saveSnapshot(
    localProfileId: string,
    input: RecommendationSnapshotInput,
  ): Promise<RecommendationSnapshot>;
}

export class RecommendationRepositoryError extends Error {
  readonly code: 'invalid-input' | 'invalid-data' | 'unavailable';

  constructor(code: 'invalid-input' | 'invalid-data' | 'unavailable') {
    super('The local recommendation operation could not be completed.');
    this.name = 'RecommendationRepositoryError';
    this.code = code;
  }
}

type Dependencies = Readonly<{ createId: () => string; now: () => string }>;

function isUtcIso(value: string): boolean {
  const parsed = Date.parse(value);
  return typeof value === 'string' &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isGenerationMode(value: string): value is RecommendationGenerationMode {
  return value === 'ai-assisted' || value === 'deterministic-fallback';
}

function mapRecord(record: RecommendationSnapshotRecord): RecommendationSnapshot {
  try {
    if (
      !isUuidV4(record.id) ||
      !record.localProfileId ||
      !record.weatherSnapshotId ||
      !record.locationKey ||
      !isGenerationMode(record.generationMode) ||
      !isUtcIso(record.createdAt) ||
      !isUtcIso(record.updatedAt) ||
      record.createdAt > record.updatedAt
    ) throw new Error();
    const context = parseRecommendationContext(JSON.parse(record.contextJson));
    const recommendation = mapStoredRecommendation(
      context,
      JSON.parse(record.outfitsJson),
      record.generationMode,
    );
    return Object.freeze({
      id: record.id,
      localProfileId: record.localProfileId,
      weatherSnapshotId: record.weatherSnapshotId,
      locationKey: record.locationKey,
      clothingPreference: context.clothingPreference,
      dayVariant: 'dayVariant' in context ? context.dayVariant : null,
      generationMode: record.generationMode,
      recommendation,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch {
    throw new RecommendationRepositoryError('invalid-data');
  }
}

export class LocalRecommendationRepository implements RecommendationRepository {
  private readonly dataSource: RecommendationLocalDataSource;
  private readonly dependencies: Dependencies;

  constructor(
    dataSource: RecommendationLocalDataSource,
    dependencies: Dependencies,
  ) {
    this.dataSource = dataSource;
    this.dependencies = dependencies;
  }

  async getSnapshot(localProfileId: string): Promise<RecommendationSnapshot | null> {
    if (!localProfileId) throw new RecommendationRepositoryError('invalid-input');
    try {
      const record = await this.dataSource.getSnapshot(localProfileId);
      return record ? mapRecord(record) : null;
    } catch (error) {
      if (error instanceof RecommendationRepositoryError) throw error;
      throw new RecommendationRepositoryError('unavailable');
    }
  }

  async saveSnapshot(
    localProfileId: string,
    input: RecommendationSnapshotInput,
  ): Promise<RecommendationSnapshot> {
    try {
      if (
        !localProfileId ||
        !input.weatherSnapshotId ||
        !input.locationKey ||
        input.recommendation.status !== 'recommended'
      ) throw new RecommendationRepositoryError('invalid-input');
      const context = parseRecommendationContext(input.context);
      const outfits = toStoredRecommendationOutfits(input.recommendation);
      mapStoredRecommendation(
        context,
        outfits,
        input.recommendation.generationMode,
      );
      const existing = await this.dataSource.getSnapshot(localProfileId);
      const now = this.dependencies.now();
      const record: RecommendationSnapshotRecord = {
        id: existing?.id ?? this.dependencies.createId(),
        localProfileId,
        weatherSnapshotId: input.weatherSnapshotId,
        locationKey: input.locationKey,
        generationMode: input.recommendation.generationMode,
        contextJson: JSON.stringify(context),
        outfitsJson: JSON.stringify(outfits),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (!isUuidV4(record.id) || !isUtcIso(record.createdAt) || !isUtcIso(record.updatedAt)) {
        throw new RecommendationRepositoryError('invalid-input');
      }
      return mapRecord(await this.dataSource.replaceSnapshot(record));
    } catch (error) {
      if (error instanceof RecommendationRepositoryError) throw error;
      throw new RecommendationRepositoryError('unavailable');
    }
  }
}
