import { useRouter } from 'expo-router';

import { ProfileScreen } from '@/features/profile/presentation/profile-screen';

export default function ProfileRoute() {
  const router = useRouter();

  return (
    <ProfileScreen
      onOpenSettings={() => router.push('/settings')}
      onOpenWardrobe={() => router.push('/wardrobe')}
    />
  );
}
