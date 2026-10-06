import { useState } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { ageBucketProperty, dressStyleProperty } from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetFieldsChanged } from '@/features/wardrobe/application/closet-field-changes';
import type { PieceSheetTarget, PieceSheetValues } from '@/features/wardrobe/presentation/piece-edit-sheet';

/**
 * O6: outfit detail's one sheet that writes a piece's Closet record, the matching one or a new
 * one. Taxonomy 5.8's existing events, with `entry_point: 'outfit_detail'`, and no new event.
 */
export function usePieceSheet() {
  const wardrobe = useWardrobeApplication();
  const { analytics, firstUses } = useProductAnalytics();
  const { resolvedDressStyle } = useRecommendationApplication();
  const { state: profileState } = useProfileApplication();
  const [target, setTarget] = useState<PieceSheetTarget | null>(null);

  const save = async ({ entryState, colorFamily, colorChoice, photoChange }: PieceSheetValues) => {
    if (!target) return;
    const { match, garmentTypeId } = target;
    const photo = photoChange.kind === 'unchanged' ? undefined : photoChange;
    // O8: the sheet sends a palette choice only when the user picked a new one; without it
    // the repository keeps the stored choice. The choice itself never enters analytics.
    const choice = colorChoice ? { colorChoice } : {};
    if (match.kind === 'owned' || match.kind === 'wanted') {
      const submitted = { entryState, colorFamily, ...choice };
      const fieldsChanged = closetFieldsChanged(match.item, submitted, photoChange.kind !== 'unchanged');
      if (fieldsChanged.length > 0 || colorChoice) {
        const item = photo
          ? await wardrobe.updateItem(match.item.id, submitted, photo)
          : await wardrobe.updateItem(match.item.id, submitted);
        if (item.garmentTypeId && fieldsChanged.length > 0) {
          analytics.capture('closet_item_updated', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            fields_changed: fieldsChanged,
            garment_type_id: item.garmentTypeId,
            entry_point: 'outfit_detail',
          });
        }
      }
      setTarget(null);
      return;
    }
    const input = { garmentTypeId, entryState, colorFamily, ...choice };
    const item = photo ? await wardrobe.createItem(input, photo) : await wardrobe.createItem(input);
    setTarget(null);
    if (!item.garmentTypeId) return;
    analytics.capture('closet_item_created', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      state: item.entryState,
      garment_type_id: item.garmentTypeId,
      has_photo: item.photoRelativePath !== null,
      entry_point: 'outfit_detail',
      dress_style: dressStyleProperty(resolvedDressStyle),
      age_bucket: ageBucketProperty(profileState.status === 'ready' ? profileState.profile.birthDate : null),
    });
    void firstUses.markFirstUse('closet').then((firstUse) => {
      if (!firstUse) return;
      analytics.capture('feature_used_first_time', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        feature_name: 'closet',
      });
    });
  };

  return {
    target,
    open: setTarget,
    close: () => setTarget(null),
    save,
  };
}
