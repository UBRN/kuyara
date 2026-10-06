import type { DressStyle, StyleAesthetic, WeatherConditionCode } from '@kuyara/contracts';

import type { ClothingPreference } from '@/domain/preferences';
import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationContext } from '@/features/recommendation/application/recommendation-context';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';

/** The persisted recommendation the application reads and writes; `LocalRecommendationRepository` implements it. */
export type RecommendationSnapshot = Readonly<{
  id: string;
  localProfileId: string;
  weatherSnapshotId: string;
  locationKey: string;
  clothingPreference: ClothingPreference;
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
