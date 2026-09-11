import type { PlaceSearchResult } from '@kuyara/contracts';

import {
  failureCategoryFromErrorKind,
  type FailureCategory,
} from '@/domain/failure-category';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import { conditionCategory } from '@/features/analytics/domain/analytics-mappers';
import type { CaptureAnalyticsEvent } from '@/features/analytics/domain/product-analytics';
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
  isManualLocationId,
  manualLocationKey,
  normalizeCoordinates,
  weatherFreshness,
  type ActiveLocation,
  type ManualLocationId,
  type WeatherFreshness,
  type WeatherSnapshot,
} from '@/features/weather/domain/weather';

// Taxonomy 5.4: the exact four fetch paths `refreshOnce` can be entered from. Values are
// already the `weather_refreshed` `trigger_method` strings, so no separate mapper is needed.
export type WeatherRefreshTrigger =
  | 'manual'
  | 'automatic_no_cache'
  | 'automatic_stale'
  | 'location_changed';

export type LocationFlowState =
  | 'idle'
  | 'rationale'
  | 'denied-requestable'
  | 'denied-permanent'
  | 'services-unavailable'
  | 'lookup-failed'
  | 'selection-failed';

export type WeatherReadyState = Readonly<{
  status: 'ready';
  activeLocation: ActiveLocation | null;
  snapshot: WeatherSnapshot | null;
  freshness: WeatherFreshness | null;
  permission: LocationPermissionState;
  locationFlow: LocationFlowState;
  isSelectingLocation: boolean;
  isRefreshing: boolean;
  refreshFailure: FailureCategory | null;
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
  // Optional: `weather_refreshed` fires on every completed attempt regardless of trigger,
  // including a coalesced duplicate's single underlying attempt, which only `refreshOnce`
  // can observe. A no-op default keeps existing composition and tests unchanged.
  captureAnalyticsEvent?: CaptureAnalyticsEvent;
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
  private readonly captureAnalyticsEvent: CaptureAnalyticsEvent;

  constructor(
    localProfileId: string,
    dependencies: Dependencies,
  ) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
    this.captureAnalyticsEvent = dependencies.captureAnalyticsEvent ?? (() => undefined);
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

  async selectPlaceSearchResult(place: PlaceSearchResult): Promise<void> {
    if (place.timeZone === null || !isManualLocationId(place.id)) return;
    if (this.requireReady().isSelectingLocation) return;
    await this.selectLocation({
      source: 'manual',
      catalogId: place.id,
      locationKey: manualLocationKey(place.id),
      displayName: place.displayName,
      coordinates: normalizeCoordinates(place.latitudeE2 / 100, place.longitudeE2 / 100),
      timeZone: place.timeZone,
    });
  }

  // The explicit user-triggered refresh: Today and Weather both call this for their pull
  // gesture and visible control, and reuse it as the retry action when a failure is shown
  // (taxonomy 5.7 notes neither surface has a separate retry control). The caller reads the
  // outcome back through `getSnapshot()` after this resolves, since the state it needs is
  // committed synchronously inside `refreshOnce` before the promise settles.
  refresh(): Promise<void> {
    const active = this.state.status === 'ready' ? this.state.activeLocation : null;
    return active ? this.refreshLocation(active, 'manual') : Promise.resolve();
  }

  // Freshness moves with the clock, not with a state change, so the surfaces that show it
  // re-evaluate it when they regain focus, and foreground shares the same path. It is a
  // bound property because a focus effect depending on it must not re-run on every state
  // change.
  revalidateFreshness = async (): Promise<void> => {
    if (this.state.status !== 'ready') return;
    const current = this.state;
    const freshness = current.snapshot
      ? weatherFreshness(current.snapshot.fetchedAt, this.dependencies.now())
      : null;
    const snapshot = freshness === 'invalid' ? null : current.snapshot;
    this.setReady({
      ...current,
      snapshot,
      freshness: freshness === 'invalid' ? null : freshness,
    });
    if (!current.activeLocation || (snapshot && freshness === 'fresh')) return;
    await this.refreshLocation(
      current.activeLocation,
      snapshot ? 'automatic_stale' : 'automatic_no_cache',
    );
  };

  async onForeground(): Promise<void> {
    if (this.state.status !== 'ready') return;
    const permission = await this.dependencies.deviceLocation.getPermissionState();
    const current = this.requireReady();
    this.setReady({
      ...current,
      permission,
      locationFlow: permission.kind === 'granted' ? 'idle' : current.locationFlow,
    });

    // A traveller's device location is only ever read when they pick it, so the city under
    // "Current location" survives the flight. One bounded re-acquisition per foreground
    // event corrects it; a failed lookup is silent, since the user asked for nothing here.
    const previous = this.requireReady().activeLocation;
    if (previous?.source === 'device' && permission.kind === 'granted') {
      const result = await this.dependencies.deviceLocation.getCurrentLocation();
      const active = this.requireReady().activeLocation;
      const moved = result.kind === 'success'
        && (result.location.locationKey !== previous.locationKey
          || result.location.timeZone !== previous.timeZone);
      // A selection made while the lookup ran wins over the lookup it raced.
      const unchanged = active?.locationKey === previous.locationKey
        && active.timeZone === previous.timeZone;
      if (moved && unchanged) {
        await this.selectLocation(result.location);
        return;
      }
    }

    await this.revalidateFreshness();
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
      if (activeLocation && freshness !== 'fresh') {
        void this.refreshLocation(
          activeLocation,
          snapshot ? 'automatic_stale' : 'automatic_no_cache',
        );
      }
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
    const locationChanged = persisted.locationKey !== current.activeLocation?.locationKey
      || persisted.timeZone !== current.activeLocation?.timeZone;
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
      if (loadedFreshness !== 'fresh') void this.refreshLocation(persisted, 'location_changed');
    } catch {
      this.setReady({
        ...this.requireReady(), isSelectingLocation: false, refreshFailure: 'unavailable',
      });
    }
  }

  private refreshLocation(location: ActiveLocation, trigger: WeatherRefreshTrigger): Promise<void> {
    const existing = this.refreshes.get(location.locationKey);
    if (existing) return existing;
    if (this.state.status === 'ready' && this.state.activeLocation?.locationKey === location.locationKey) {
      this.setReady({ ...this.state, isRefreshing: true });
    }
    const promise = this.refreshOnce(location, trigger).finally(() => this.refreshes.delete(location.locationKey));
    this.refreshes.set(location.locationKey, promise);
    return promise;
  }

  private async refreshOnce(location: ActiveLocation, trigger: WeatherRefreshTrigger): Promise<void> {
    const isCurrent = () =>
      this.state.status === 'ready' && this.state.activeLocation?.locationKey === location.locationKey;
    try {
      const provided = await this.dependencies.provider.fetchSnapshot(location);
      if (provided.locationKey !== location.locationKey || provided.timeZone !== location.timeZone) {
        throw new Error('Mismatched weather location.');
      }
      if (weatherFreshness(provided.fetchedAt, this.dependencies.now()) === 'invalid') {
        throw new Error('Invalid weather fetch time.');
      }
      const snapshot = await this.requireRepository().saveSnapshot(this.localProfileId, provided);
      if (isCurrent() && this.state.status === 'ready') {
        const freshness = weatherFreshness(snapshot.fetchedAt, this.dependencies.now());
        this.setReady({
          ...this.state, snapshot,
          freshness: freshness === 'invalid' ? null : freshness,
          isRefreshing: false, refreshFailure: null,
        });
      }
      // Taxonomy 5.4: fires on every completed attempt, coalesced duplicates included,
      // regardless of whether this location is still the active one when it resolves.
      this.captureAnalyticsEvent('weather_refreshed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        trigger_method: trigger,
        result: 'success',
        condition_category: conditionCategory(snapshot.current.condition),
      });
    } catch (error) {
      if (isCurrent() && this.state.status === 'ready') {
        this.setReady({
          ...this.state,
          isRefreshing: false,
          // Weather cannot produce 'unknown': a throw that is not a provider error here
          // is a repository or invariant failure, which stays 'unavailable' as before.
          refreshFailure: error instanceof WeatherProviderError
            ? failureCategoryFromErrorKind(error.kind)
            : 'unavailable',
        });
      }
      this.captureAnalyticsEvent('weather_refreshed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        trigger_method: trigger,
        result: this.hasRenderableSnapshot() ? 'failure_kept_last_known' : 'failure_no_snapshot',
      });
    }
  }

  private hasRenderableSnapshot(): boolean {
    return this.state.status === 'ready' && this.state.snapshot !== null;
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
