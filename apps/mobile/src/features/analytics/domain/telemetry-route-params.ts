// Observe's expo-router integration exports the resolved path and every serializable route
// and query parameter on each navigation metric. A key listed here is dropped from the
// metric and, because any drop happens, the resolved path is replaced with `urlHidden`, so
// only the route pattern (`/(tabs)/(profile)/wardrobe/[id]`) leaves the device.
//
// The list is every dynamic segment and every query parameter the app can put into a URL:
// outfit option ids, wardrobe item ids, catalog garment type ids, the Closet ownership
// filter and the picker's return target. Place search never becomes a route parameter; the
// Weather location screen holds its query in component state. A `telemetry-route-params`
// test scans `src/app` and the `useLocalSearchParams` call sites and fails when a new
// parameter appears without being listed here.
export const telemetryFilteredRouteParams = [
  'filter',
  'garmentTypeId',
  'id',
  'itemId',
  'returnTo',
  'selectedTypeId',
] as const;
