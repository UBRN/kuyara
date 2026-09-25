import type { DressStyle, StyleAesthetic, WeatherConditionCode } from '@kuyara/contracts';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';

import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import {
  isRecommendationGenerationMode,
  type RecommendationGenerationMode,
} from '@/features/recommendation/domain/generation-mode';
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
  dressStyle: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
  catalogVersion: number | null;
  dayVariant: number | null;
  localDayKey: string | null;
  paletteWeather?: Readonly<{ temperatureC: number; condition: WeatherConditionCode }>;
  coverageStart?: string;
  coverageEnd?: string;
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
  getSnapshot(localProfileId: string, localDayKey?: string): Promise<RecommendationSnapshot | null>;
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
      !isUtcIso(record.createdAt) ||
      !isUtcIso(record.updatedAt)
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
      dressStyle: 'dressStyle' in context ? context.dressStyle ?? 'smart' : 'smart',
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
