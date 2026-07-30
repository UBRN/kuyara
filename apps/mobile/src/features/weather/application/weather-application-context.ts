import { createContext, use } from 'react';

import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import type { ManualLocationId } from '@/features/weather/domain/weather';

export type WeatherApplicationValue = Readonly<{
  state: WeatherApplicationState;
  retry: () => Promise<void>;
  dismissLocationFlow: () => void;
  beginDeviceLocationSelection: () => Promise<void>;
  confirmDeviceLocationRequest: () => Promise<void>;
  openApplicationSettings: () => Promise<void>;
  selectManualLocation: (id: ManualLocationId) => Promise<void>;
  refresh: () => Promise<void>;
}>;

export const WeatherApplicationContext = createContext<WeatherApplicationValue | null>(null);

export function useWeatherApplication(): WeatherApplicationValue {
  const value = use(WeatherApplicationContext);
  if (!value) throw new Error('useWeatherApplication must be used within WeatherApplicationProvider');
  return value;
}
