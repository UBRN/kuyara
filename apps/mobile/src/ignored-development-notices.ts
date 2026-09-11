import { LogBox } from 'react-native';

// Reanimated prints this development-only notice while it is imported, whenever the
// system Reduce Motion setting is on; its troubleshooting guide says to ignore it or to
// register exactly this pattern. kuyara's motion under Reduce Motion is governed by the
// theme's motion tokens, so the notice carries nothing to act on. The pattern has to be
// registered before the app tree imports Reanimated, because React Native checks the
// ignore list when the warning is emitted, so this module is imported first from the entry.
LogBox.ignoreLogs(['[Reanimated] Reduced motion setting is enabled on this device.']);
