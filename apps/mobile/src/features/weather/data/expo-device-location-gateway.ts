import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type {
  DeviceLocationGateway,
  DeviceLocationResult,
  LocationPermissionState,
} from '@/features/weather/data/device-location-gateway';
import {
  deviceLocationKey,
  isValidTimeZone,
  normalizeCoordinates,
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
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (!isValidTimeZone(timeZone)) {
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
