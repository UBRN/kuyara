import type {
  DeviceLocationGateway,
  LocationPermissionState,
} from '@/features/weather/data/device-location-gateway';
import { getManualLocation } from '@/features/weather/data/manual-location-catalog';
import {
  WeatherRepositoryError,
  type WeatherRepository,
} from '@/features/weather/data/weather-repository';
import {
  WeatherProviderError,
  type WeatherProvider,
} from '@/features/weather/data/weather-provider';
import {
  weatherFreshness,
  type ActiveLocation,
  type ManualLocationId,
  type WeatherFreshness,
  type WeatherSnapshot,
} from '@/features/weather/domain/weather';

export type LocationFlowState =
  | 'idle'
  | 'rationale'
  | 'denied-requestable'
  | 'denied-permanent'
  | 'services-unavailable'
  | 'lookup-failed'
  | 'selection-failed';

export type WeatherRefreshFailure = 'offline' | 'unavailable' | 'rate-limited';

export type WeatherReadyState = Readonly<{
  status: 'ready';
  activeLocation: ActiveLocation | null;
  snapshot: WeatherSnapshot | null;
  freshness: WeatherFreshness | null;
  permission: LocationPermissionState;
  locationFlow: LocationFlowState;
  isSelectingLocation: boolean;
  isRefreshing: boolean;
  refreshFailure: WeatherRefreshFailure | null;
}>;

export type WeatherApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error' }>
  | WeatherReadyState;

type Dependencies = Readonly<{
  loadRepository: () => Promise<WeatherRepository>;
  provider: WeatherProvider;
  deviceLocation: DeviceLocationGateway;
  now: () => string;
}>;

type Listener = () => void;

export class WeatherApplicationController {
  private state: WeatherApplicationState = { status: 'loading' };
  private repository: WeatherRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly refreshes = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly dependencies: Dependencies;

  constructor(
    localProfileId: string,
    dependencies: Dependencies,
  ) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
  }

  getSnapshot = (): WeatherApplicationState => this.state;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce();
    }
    return this.initializationPromise;
  }

  retry(): Promise<void> {
    if (this.state.status === 'error') {
      this.initializationPromise = null;
      this.state = { status: 'loading' };
      this.emit();
    }
    return this.initialize();
  }

  dismissLocationFlow(): void {
    if (this.state.status === 'ready') this.setReady({ ...this.state, locationFlow: 'idle' });
  }

  async beginDeviceLocationSelection(): Promise<void> {
    const current = this.requireReady();
    this.setReady({ ...current, isSelectingLocation: true, locationFlow: 'idle' });
    const permission = await this.dependencies.deviceLocation.getPermissionState();
    const ready = this.requireReady();
    if (permission.kind === 'granted') {
      this.setReady({ ...ready, permission, isSelectingLocation: false });
      await this.acquireDeviceLocation();
      return;
    }
    const locationFlow = permission.kind === 'denied' && !permission.canRequestAgain
      ? 'denied-permanent'
      : 'rationale';
    this.setReady({ ...ready, permission, locationFlow, isSelectingLocation: false });
  }

  async confirmDeviceLocationRequest(): Promise<void> {
    const current = this.requireReady();
    if (current.permission.kind === 'denied' && !current.permission.canRequestAgain) {
      this.setReady({ ...current, locationFlow: 'denied-permanent' });
      return;
    }
    this.setReady({ ...current, isSelectingLocation: true, locationFlow: 'idle' });
    const permission = await this.dependencies.deviceLocation.requestForegroundPermission();
    const ready = this.requireReady();
    this.setReady({ ...ready, permission, isSelectingLocation: false });
    if (permission.kind === 'granted') {
      await this.acquireDeviceLocation();
    } else {
      this.setReady({
        ...this.requireReady(),
        locationFlow: permission.kind === 'denied' && permission.canRequestAgain
          ? 'denied-requestable'
          : 'denied-permanent',
      });
    }
  }

  async openApplicationSettings(): Promise<void> {
    try {
      await this.dependencies.deviceLocation.openApplicationSettings();
    } catch {
      const current = this.requireReady();
      this.setReady({ ...current, locationFlow: 'selection-failed' });
    }
  }

  async selectManualLocation(id: ManualLocationId): Promise<void> {
    const location = getManualLocation(id);
    if (!location) return;
    await this.selectLocation(location);
  }

  refresh(): Promise<void> {
    const active = this.state.status === 'ready' ? this.state.activeLocation : null;
    return active ? this.refreshLocation(active) : Promise.resolve();
  }

  async onForeground(): Promise<void> {
    if (this.state.status !== 'ready') return;
    const permission = await this.dependencies.deviceLocation.getPermissionState();
    const current = this.requireReady();
    const freshness = current.snapshot
      ? weatherFreshness(current.snapshot.fetchedAt, this.dependencies.now())
      : null;
    this.setReady({
      ...current,
      snapshot: freshness === 'invalid' ? null : current.snapshot,
      freshness: freshness === 'invalid' ? null : freshness,
      permission,
      locationFlow: permission.kind === 'granted' ? 'idle' : current.locationFlow,
    });
    if (!current.activeLocation) return;
    if (!current.snapshot || freshness !== 'fresh') {
      await this.refreshLocation(current.activeLocation);
    }
  }

  private async initializeOnce(): Promise<void> {
    try {
      this.repository = await this.dependencies.loadRepository();
      const [activeLocation, permission] = await Promise.all([
        this.repository.getActiveLocation(this.localProfileId),
        this.dependencies.deviceLocation.getPermissionState(),
      ]);
      const loadedSnapshot = activeLocation ? await this.loadMatchingSnapshot(activeLocation) : null;
      const loadedFreshness = loadedSnapshot ? weatherFreshness(loadedSnapshot.fetchedAt, this.dependencies.now()) : null;
      const snapshot = loadedFreshness === 'invalid' ? null : loadedSnapshot;
      const freshness = loadedFreshness === 'invalid' ? null : loadedFreshness;
      this.setReady({
        status: 'ready', activeLocation, snapshot,
        freshness,
        permission, locationFlow: 'idle', isSelectingLocation: false,
        isRefreshing: false, refreshFailure: null,
      });
      if (activeLocation && freshness !== 'fresh') void this.refreshLocation(activeLocation);
    } catch {
      this.state = { status: 'error' };
      this.emit();
    }
  }

  private async acquireDeviceLocation(): Promise<void> {
    const current = this.requireReady();
    this.setReady({ ...current, isSelectingLocation: true, locationFlow: 'idle' });
    const result = await this.dependencies.deviceLocation.getCurrentLocation();
    const ready = this.requireReady();
    if (result.kind !== 'success') {
      this.setReady({
        ...ready,
        isSelectingLocation: false,
        locationFlow: result.kind === 'services-unavailable' ? 'services-unavailable' : 'lookup-failed',
      });
      return;
    }
    this.setReady({ ...ready, isSelectingLocation: false });
    await this.selectLocation(result.location);
  }

  private async selectLocation(location: ActiveLocation): Promise<void> {
    const previous = this.requireReady();
    this.setReady({ ...previous, isSelectingLocation: true, locationFlow: 'idle' });
    let persisted: ActiveLocation;
    try {
      persisted = await this.requireRepository().setActiveLocation(this.localProfileId, location);
    } catch {
      this.setReady({ ...previous, isSelectingLocation: false, locationFlow: 'selection-failed' });
      return;
    }

    const current = this.requireReady();
    const locationChanged = persisted.locationKey !== current.activeLocation?.locationKey;
    this.setReady({
      ...current, activeLocation: persisted,
      snapshot: locationChanged ? null : current.snapshot,
      freshness: locationChanged ? null : current.freshness,
      isRefreshing: false, refreshFailure: null,
    });

    try {
      const loadedSnapshot = await this.loadMatchingSnapshot(persisted);
      const loadedFreshness = loadedSnapshot
        ? weatherFreshness(loadedSnapshot.fetchedAt, this.dependencies.now())
        : null;
      this.setReady({
        ...this.requireReady(), snapshot: loadedFreshness === 'invalid' ? null : loadedSnapshot,
        freshness: loadedFreshness === 'invalid' ? null : loadedFreshness,
        isSelectingLocation: false, isRefreshing: false, refreshFailure: null,
      });
      if (loadedFreshness !== 'fresh') void this.refreshLocation(persisted);
    } catch {
      this.setReady({
        ...this.requireReady(), isSelectingLocation: false, refreshFailure: 'unavailable',
      });
    }
  }

  private refreshLocation(location: ActiveLocation): Promise<void> {
    const existing = this.refreshes.get(location.locationKey);
    if (existing) return existing;
    if (this.state.status === 'ready' && this.state.activeLocation?.locationKey === location.locationKey) {
      this.setReady({ ...this.state, isRefreshing: true });
    }
    const promise = this.refreshOnce(location).finally(() => this.refreshes.delete(location.locationKey));
    this.refreshes.set(location.locationKey, promise);
    return promise;
  }

  private async refreshOnce(location: ActiveLocation): Promise<void> {
    try {
      const provided = await this.dependencies.provider.fetchSnapshot(location);
      if (provided.locationKey !== location.locationKey || provided.timeZone !== location.timeZone) {
        throw new Error('Mismatched weather location.');
      }
      if (weatherFreshness(provided.fetchedAt, this.dependencies.now()) === 'invalid') {
        throw new Error('Invalid weather fetch time.');
      }
      const snapshot = await this.requireRepository().saveSnapshot(this.localProfileId, provided);
      if (this.state.status === 'ready' && this.state.activeLocation?.locationKey === location.locationKey) {
        const freshness = weatherFreshness(snapshot.fetchedAt, this.dependencies.now());
        this.setReady({
          ...this.state, snapshot,
          freshness: freshness === 'invalid' ? null : freshness,
          isRefreshing: false, refreshFailure: null,
        });
      }
    } catch (error) {
      if (this.state.status === 'ready' && this.state.activeLocation?.locationKey === location.locationKey) {
        this.setReady({
          ...this.state,
          isRefreshing: false,
          refreshFailure:
            error instanceof WeatherProviderError && error.kind === 'network'
              ? 'offline'
              : error instanceof WeatherProviderError && error.kind === 'rate-limited'
                ? 'rate-limited'
                : 'unavailable',
        });
      }
    }
  }

  private async loadMatchingSnapshot(location: ActiveLocation): Promise<WeatherSnapshot | null> {
    try {
      const snapshot = await this.requireRepository().getSnapshot(this.localProfileId, location.locationKey);
      return snapshot?.locationKey === location.locationKey ? snapshot : null;
    } catch (error) {
      if (error instanceof WeatherRepositoryError && error.code === 'invalid-data') return null;
      throw error;
    }
  }

  private requireRepository(): WeatherRepository {
    if (!this.repository) throw new Error('Weather repository is unavailable.');
    return this.repository;
  }

  private requireReady(): WeatherReadyState {
    if (this.state.status !== 'ready') throw new Error('Weather application is not ready.');
    return this.state;
  }

  private setReady(state: WeatherReadyState): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
