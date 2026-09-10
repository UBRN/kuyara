import { createContext, use } from 'react';
import type { PlaceSearchResult } from '@kuyara/contracts';

import type { SearchPlaces } from '@/features/weather/application/place-search-controller';
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
  // Optional: a live, non-React-timed read of the controller's state. `manual_refresh_triggered`
  // and `retry_after_failure_triggered` (taxonomy 5.7) need the outcome of an awaited `refresh()`
  // immediately, and the controller commits it synchronously before that promise settles, so a
  // route can read it here without waiting for a re-render. Optional so existing test doubles
  // built before this event pair keep compiling unchanged.
  getSnapshot?: () => WeatherApplicationState;
}>;

export const WeatherApplicationContext = createContext<WeatherApplicationValue | null>(null);

export type PlaceSearchApplicationValue = Readonly<{
  selectPlaceSearchResult: (place: PlaceSearchResult) => Promise<void>;
  searchPlaces: SearchPlaces;
}>;

export const PlaceSearchApplicationContext = createContext<PlaceSearchApplicationValue | null>(null);

export function usePlaceSearchApplication(): PlaceSearchApplicationValue {
  const value = use(PlaceSearchApplicationContext);
  if (!value) throw new Error('usePlaceSearchApplication must be used within WeatherApplicationProvider');
  return value;
}

export function useWeatherApplication(): WeatherApplicationValue {
  const value = use(WeatherApplicationContext);
  if (!value) throw new Error('useWeatherApplication must be used within WeatherApplicationProvider');
  return value;
}
