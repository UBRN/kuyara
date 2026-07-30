import { useLocalSearchParams } from 'expo-router';

import { WardrobeEditItemRoute } from '@/features/wardrobe/presentation/wardrobe-item-routes';

export default function WardrobeItemRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  return <WardrobeEditItemRoute itemId={id} />;
}
