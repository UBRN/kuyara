import type {
  DeviceActiveLocation,
  LocationAccuracy,
} from '@/features/weather/domain/weather';

export type LocationPermissionState =
  | Readonly<{ kind: 'undetermined' }>
  | Readonly<{ kind: 'granted'; accuracy: LocationAccuracy }>
  | Readonly<{ kind: 'denied'; canRequestAgain: boolean }>;

export type DeviceLocationResult =
  | Readonly<{ kind: 'success'; location: DeviceActiveLocation }>
  | Readonly<{ kind: 'services-unavailable' }>
  | Readonly<{ kind: 'lookup-failed' }>;

export interface DeviceLocationGateway {
  getPermissionState(): Promise<LocationPermissionState>;
  requestForegroundPermission(): Promise<LocationPermissionState>;
  getCurrentLocation(): Promise<DeviceLocationResult>;
  openApplicationSettings(): Promise<void>;
}
