// Observe's expo-router integration exports the resolved path and every serializable route
// and query parameter on each navigation metric. A key listed here is dropped from the
// metric and, because any drop happens, the resolved path is replaced with `urlHidden`, so
// only the route pattern (`/(tabs)/(profile)/wardrobe/[id]`) leaves the device.
//
// The list is every dynamic segment and every query parameter the app can put into a URL:
// outfit option ids, the day an outfit detail belongs to, whether it opened from Today's band
// and the colours it opens painted in, wardrobe item ids, catalog garment type ids, the Closet
// ownership filter, the id of the item the Closet add flow has just saved, the consent presentation
// nonce, the picker's return target, the account screens' development scenario and the
// phrase Siri's Closet add opens the add form with (the add route also drops it at once).
// Place search never becomes a route parameter; the Weather location screen holds its query
// in component state. A `telemetry-route-params`
// test scans `src/app` and the `useLocalSearchParams` call sites and fails when a new
// parameter appears without being listed here.
export const telemetryFilteredRouteParams = [
  'accountScenario',
  'added',
  'category',
  'colors',
  'day',
  'filter',
  'from',
  'garmentTypeId',
  'id',
  'itemId',
  'phrase',
  'presentation',
  'returnTo',
  'selectedTypeId',
] as const;
