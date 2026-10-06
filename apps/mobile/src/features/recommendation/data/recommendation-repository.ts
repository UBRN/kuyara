import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';

import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import {
  RecommendationRepositoryError,
  type RecommendationRepository,
  type RecommendationSnapshot,
  type RecommendationSnapshotInput,
} from '@/features/recommendation/application/recommendation-repository';
import { isRecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type {
  RecommendationLocalDataSource,
  RecommendationSnapshotRecord,
} from '@/features/recommendation/data/recommendation-local-data-source';
import type { RecommendationContext } from '@/features/recommendation/application/recommendation-context';
import {
  mapStoredRecommendation,
  parseRecommendationContext,
  toStoredRecommendationOutfits,
} from '@/features/recommendation/data/stored-recommendation-mapper';
import { isUtcIsoTimestamp, isUuidV4 } from '@/domain/record-identity';
import { defaultDressStyle } from '@/features/profile/domain/profile';

type Dependencies = Readonly<{ createId: () => string; now: () => string }>;

function requireCurrentTrio(
  context: RecommendationContext,
  recommendation: OutfitRecommendationSuccess,
  localDayKey?: string,
): void {
  if (!('options' in context) ||
    context.catalogVersion !== garmentCatalogVersion ||
    !context.localDayKey ||
    (localDayKey !== undefined && context.localDayKey !== localDayKey) ||
    recommendation.outfits.length !== 3 ||
    new Set(recommendation.outfits.map(({ optionId }) => optionId)).size !== 3 ||
    recommendation.outfits.some(({ optionId }) =>
      !context.options.some((option) => option.optionId === optionId))) {
    throw new Error('Invalid recommendation snapshot.');
  }
}

function mapRecord(record: RecommendationSnapshotRecord, localDayKey?: string): RecommendationSnapshot {
  try {
    if (
      !isUuidV4(record.id) ||
      !record.localProfileId ||
      !record.weatherSnapshotId ||
      !record.locationKey ||
      !isRecommendationGenerationMode(record.generationMode) ||
      !isUtcIsoTimestamp(record.createdAt) ||
      !isUtcIsoTimestamp(record.updatedAt)
    ) throw new Error();
    const context = parseRecommendationContext(JSON.parse(record.contextJson));
    const recommendation = mapStoredRecommendation(
      context,
      JSON.parse(record.outfitsJson),
      record.generationMode,
    );
    requireCurrentTrio(context, recommendation, localDayKey);
    return Object.freeze({
      id: record.id,
      localProfileId: record.localProfileId,
      weatherSnapshotId: record.weatherSnapshotId,
      locationKey: record.locationKey,
      clothingPreference: context.clothingPreference,
      dressStyle: 'dressStyle' in context ? context.dressStyle ?? defaultDressStyle : defaultDressStyle,
      styleAesthetics: 'styleAesthetics' in context ? context.styleAesthetics ?? [] : [],
      catalogVersion: 'catalogVersion' in context ? context.catalogVersion : null,
      dayVariant: 'dayVariant' in context ? context.dayVariant : null,
      localDayKey: 'localDayKey' in context ? context.localDayKey ?? null : null,
      paletteWeather: 'paletteWeather' in context ? context.paletteWeather : undefined,
      coverageStart: 'coverageStart' in context ? context.coverageStart : undefined,
      coverageEnd: 'coverageEnd' in context ? context.coverageEnd : undefined,
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

  async getSnapshot(localProfileId: string, localDayKey?: string): Promise<RecommendationSnapshot | null> {
    if (!localProfileId) throw new RecommendationRepositoryError('invalid-input');
    try {
      const record = await this.dataSource.getSnapshot(localProfileId);
      return record ? mapRecord(record, localDayKey) : null;
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
      try {
        requireCurrentTrio(context, input.recommendation);
      } catch {
        throw new RecommendationRepositoryError('invalid-input');
      }
      const existing = await this.dataSource.getSnapshot(localProfileId);
      const now = this.dependencies.now();
      const createdAt = existing?.createdAt ?? now;
      const record: RecommendationSnapshotRecord = {
        id: existing?.id ?? this.dependencies.createId(),
        localProfileId,
        weatherSnapshotId: input.weatherSnapshotId,
        locationKey: input.locationKey,
        generationMode: input.recommendation.generationMode,
        contextJson: JSON.stringify(context),
        outfitsJson: JSON.stringify(outfits),
        createdAt,
        // A device clock that moves backwards must not write updatedAt before createdAt.
        updatedAt: now < createdAt ? createdAt : now,
      };
      if (!isUuidV4(record.id) || !isUtcIsoTimestamp(record.createdAt) || !isUtcIsoTimestamp(record.updatedAt)) {
        throw new RecommendationRepositoryError('invalid-input');
      }
      return mapRecord(await this.dataSource.replaceSnapshot(record));
    } catch (error) {
      if (error instanceof RecommendationRepositoryError) throw error;
      throw new RecommendationRepositoryError('unavailable');
    }
  }
}
