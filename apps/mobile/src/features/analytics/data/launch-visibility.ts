// The process's one launch visibility, read from React Native's app state. `currentState`
// starts as the iOS application state when the module is set up and is corrected by a
// change event if it moved meanwhile, so a foreground launch that first reads `background`
// is seen as soon as its scene activates.
import { AppState } from 'react-native';

import { createLaunchVisibility } from '@/features/analytics/domain/launch-visibility';

export const launchVisibility = createLaunchVisibility({
  initial: AppState.currentState,
  onChange: (listener) => {
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
  },
});
