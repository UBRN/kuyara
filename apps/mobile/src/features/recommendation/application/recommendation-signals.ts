import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import { defaultDressStyle } from '@/features/profile/domain/profile';
import type {
  RecommendationApplicationInput,
  RecommendationSignals,
} from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';

/** The approved-trigger signals a generation input would produce a recommendation for. */
export function signalsOfInput(input: RecommendationApplicationInput): RecommendationSignals {
  return {
    weatherSnapshotId: input.snapshot.id,
    locationKey: input.snapshot.locationKey,
    clothingPreference: input.clothingPreference,
    dressStyle: input.dressStyle ?? defaultDressStyle,
    styleAesthetics: input.styleAesthetics,
    catalogVersion: garmentCatalogVersion,
    localDayKey: input.localDayKey,
  };
}

/** The approved-trigger signals the persisted recommendation was generated for. */
export function signalsOfSnapshot(snapshot: RecommendationSnapshot): RecommendationSignals {
  return {
    weatherSnapshotId: snapshot.weatherSnapshotId,
    locationKey: snapshot.locationKey,
    clothingPreference: snapshot.clothingPreference,
    dressStyle: snapshot.dressStyle,
    styleAesthetics: snapshot.styleAesthetics,
    catalogVersion: snapshot.catalogVersion,
    localDayKey: snapshot.localDayKey,
  };
}
