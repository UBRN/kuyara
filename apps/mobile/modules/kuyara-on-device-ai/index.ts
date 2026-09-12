import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { OnDeviceAiAvailability } from '../../src/features/recommendation/domain/on-device-ai-availability';
import type { OnDeviceAiModule } from '../../src/features/recommendation/data/on-device-ai-client';

// The Swift surface, exactly as `KuyaraOnDeviceAiModule` declares it. The native side answers
// with a flat record because that is what crosses the bridge; this file is the only place that
// shape exists, and the typed module below is what the rest of the app sees.
type NativeOnDeviceAi = Readonly<{
  getAvailability(): Promise<{ status: string; reason?: string }>;
  selectOutfits(input: string, timeoutMs: number): Promise<string>;
}>;

const unavailableReasons = [
  'device_not_eligible',
  'apple_intelligence_not_enabled',
  'model_not_ready',
  'unsupported_os',
  'unknown',
] as const;

type UnavailableReason = (typeof unavailableReasons)[number];

function isUnavailableReason(value: string | undefined): value is UnavailableReason {
  return (
    value !== undefined && (unavailableReasons as readonly string[]).includes(value)
  );
}

// Android and web never load the native module: `expo-module.config.json` declares the apple
// platform only, so there is no Kotlin stub to keep in step. The platform guard makes that
// explicit rather than leaving it to a failed lookup.
const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeOnDeviceAi>('KuyaraOnDeviceAi')
    : null;

/**
 * ADR 0034 section 6. `null` on every platform and every build where the native module is not
 * present, which the routed client already reads as an unavailable on-device tier.
 */
export const onDeviceAiModule: OnDeviceAiModule | null = native
  ? {
      async getAvailability(): Promise<OnDeviceAiAvailability> {
        const answer = await native.getAvailability();
        if (answer.status === 'available') return { status: 'available' };
        return {
          status: 'unavailable',
          reason: isUnavailableReason(answer.reason) ? answer.reason : 'unknown',
        };
      },
      selectOutfits(input, { timeoutMs }) {
        return native.selectOutfits(input, timeoutMs);
      },
    }
  : null;
