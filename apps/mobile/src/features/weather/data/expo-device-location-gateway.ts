import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type {
  DeviceLocationGateway,
  DeviceLocationResult,
  LocationPermissionState,
} from '@/features/weather/data/device-location-gateway';
import {
  deviceLocationDisplayName,
  deviceLocationKey,
  normalizeCoordinates,
  resolveDeviceLocationTimeZone,
  type LocationAccuracy,
} from '@/features/weather/domain/weather';

function mapPermission(
  permission: Location.LocationPermissionResponse,
): LocationPermissionState {
  if (permission.status === Location.PermissionStatus.UNDETERMINED) {
    return { kind: 'undetermined' };
  }

  if (!permission.granted) {
    return { kind: 'denied', canRequestAgain: permission.canAskAgain };
  }

  let accuracy: LocationAccuracy = 'approximate';
  if (permission.ios?.accuracy === 'full' || permission.android?.accuracy === 'fine') {
    accuracy = 'full';
  }

  return { kind: 'granted', accuracy };
}

export class ExpoDeviceLocationGateway implements DeviceLocationGateway {
  getPermissionState(): Promise<LocationPermissionState> {
    return Location.getForegroundPermissionsAsync().then(mapPermission).catch(() => ({
      kind: 'denied',
      canRequestAgain: false,
    }));
  }

  requestForegroundPermission(): Promise<LocationPermissionState> {
    return Location.requestForegroundPermissionsAsync().then(mapPermission).catch(() => ({
      kind: 'denied',
      canRequestAgain: false,
    }));
  }

  async getCurrentLocation(): Promise<DeviceLocationResult> {
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        return { kind: 'services-unavailable' };
      }

      const permission = mapPermission(await Location.getForegroundPermissionsAsync());
      if (permission.kind !== 'granted') {
        return { kind: 'lookup-failed' };
      }

      // Raw coordinates intentionally exist only inside this adapter.
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
        mayShowUserSettingsDialog: false,
      });
      const coordinates = normalizeCoordinates(
        result.coords.latitude,
        result.coords.longitude,
      );
      // The raw address never leaves this adapter: only its time zone and its locality name do.
      const address = await Promise.race([
        Location.reverseGeocodeAsync({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        }).then(([first]) => first ?? null),
        new Promise<null>((resolve) => setTimeout(resolve, 3_000)),
      ]).catch(() => null);
      // Expo Location 57's Android result always sets timezone to null, so the device zone carries it there.
      const timeZone = resolveDeviceLocationTimeZone(
        address?.timezone ?? null,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );

      if (timeZone === null) {
        return { kind: 'lookup-failed' };
      }

      return {
        kind: 'success',
        location: {
          source: 'device',
          accuracy: permission.accuracy,
          coordinates,
          locationKey: deviceLocationKey(coordinates),
          timeZone,
          displayName: deviceLocationDisplayName(address?.city, address?.subregion),
        },
      };
    } catch {
      return { kind: 'lookup-failed' };
    }
  }

  openApplicationSettings(): Promise<void> {
    return Linking.openSettings();
  }
}
