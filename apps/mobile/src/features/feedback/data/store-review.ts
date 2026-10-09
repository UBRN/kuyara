// The app's only importer of `expo-store-review`, guarded by architecture-invariants.test.mjs.
// The package calls `requireNativeModule` at module scope, which throws in a binary without the
// module (a build before it shipped, a test, Android here), so the require is guarded and the
// request simply does nothing there. App Store Review Guideline 5.6.1 allows only this system
// prompt: no custom rating prompt or question exists anywhere in the app.
import { Platform } from 'react-native';

type StoreReviewApi = typeof import('expo-store-review');

function loadStoreReview(): StoreReviewApi | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-store-review') as StoreReviewApi;
  } catch {
    return null;
  }
}

const storeReview = loadStoreReview();

/** Asks iOS for its rating prompt. iOS decides whether it appears and never says whether it did. */
export async function requestStoreReview(): Promise<void> {
  if (!storeReview) return;
  try {
    if (await storeReview.isAvailableAsync()) await storeReview.requestReview();
  } catch {
    // The prompt is optional; a failed request has no visible effect.
  }
}
