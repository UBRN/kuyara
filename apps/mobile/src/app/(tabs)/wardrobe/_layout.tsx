import { PrimaryTabStack } from '@/navigation/primary-tab-stack';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { WardrobeApplicationProvider } from '@/features/wardrobe/application/wardrobe-application-provider';

export default function WardrobeLayout() {
  const { state } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  return (
    <WardrobeApplicationProvider localProfileId={state.profile.id}>
      <PrimaryTabStack />
    </WardrobeApplicationProvider>
  );
}
