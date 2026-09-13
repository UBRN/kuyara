import { onDeviceAiSwitchedOff, type OnDeviceAiModule } from '@/features/recommendation/data/on-device-ai-client';

// ADR 0034 section 6: the only importer of the local Expo module anywhere in the app, the
// mirror of the rule that `components/ui` is the sole importer of the native control layer
// (ADR 0019). `rg "modules/kuyara-on-device-ai" apps/mobile/src` must return this file and
// nothing else. The export is null on Android, on web and on any build without the native
// surface, and the routed client then reads the on-device tier as unavailable.
import { onDeviceAiModule as nativeOnDeviceAiModule } from '../../../../modules/kuyara-on-device-ai';

// The development switch is the same null, so nothing above this file gains a branch: a
// development build with the tier switched off behaves exactly like an ineligible device.
export const onDeviceAiModule: OnDeviceAiModule | null = onDeviceAiSwitchedOff()
  ? null
  : nativeOnDeviceAiModule;
