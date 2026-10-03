import { structuralCategories } from '@/features/catalog/domain/garment-taxonomy';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { visibleClosetCategories } from '@/features/wardrobe/application/closet-categories';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';

/**
 * The categories the Closet and Profile show for this profile and its records. Until both
 * have loaded every category is listed, so a route asking for one is never sent elsewhere
 * on a partial answer.
 */
export function useVisibleClosetCategories(): ReturnType<typeof visibleClosetCategories> {
  const { state: profile } = useProfileApplication();
  const { state: wardrobe } = useWardrobeApplication();
  return profile.status === 'ready' && wardrobe.status === 'ready'
    ? visibleClosetCategories(profile.profile.clothingPreference, wardrobe.items)
    : structuralCategories;
}
