import { useState } from 'react';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { namePromptDue } from '@/features/today/application/today-surface';

/**
 * Today's name prompt. Dismissing it closes it for as long as Today is mounted and stores the
 * name as it is, which records the prompt version as answered.
 */
export function useNamePrompt() {
  const { state: profileState, updateDisplayName } = useProfileApplication();
  const [dismissed, setDismissed] = useState(false);
  return {
    due: namePromptDue(profileState, dismissed),
    save: updateDisplayName,
    dismiss: () => {
      setDismissed(true);
      return updateDisplayName(profileState.status === 'ready' ? profileState.profile.displayName : null);
    },
  };
}
