import { useLocalSearchParams } from 'expo-router';

import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';

export default function WardrobeRoute() {
  // ADR 0028 section 7 item 3, shared with ADR 0029: an optional initial filter so
  // Profile's Wanted row can open the Closet list on the wanted state instead of the
  // default owned one.
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const initialEntryState: WardrobeEntryState | undefined =
    filter === 'wanted' || filter === 'owned' ? filter : undefined;

  return <WardrobeListRoute initialEntryState={initialEntryState} />;
}
