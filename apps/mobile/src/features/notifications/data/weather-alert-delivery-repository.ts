import { isUtcIsoTimestamp } from '@/domain/record-identity';
import type { WeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/weather-alert-delivery-local-data-source';
import type { WeatherAlertDeliveryRecord } from '@/features/notifications/data/weather-alert-delivery-record';
import type { NotificationKind } from '@/features/notifications/data/notification-gateway';

export interface WeatherAlertDeliveryRepository {
  upsertScheduled(deliveries: readonly WeatherAlertDeliveryRecord[]): Promise<void>;
  deletePending(localProfileId: string, now: string, kind?: NotificationKind): Promise<void>;
  listFiredIds(localProfileId: string, now: string): Promise<ReadonlySet<string>>;
  /** What the OS accepted and has not fired yet. */
  listPending(localProfileId: string, now: string): Promise<readonly WeatherAlertDeliveryRecord[]>;
  pruneBefore(localProfileId: string, isoDate: string): Promise<void>;
}

export class LocalWeatherAlertDeliveryRepository
implements WeatherAlertDeliveryRepository {
  private readonly dataSource: WeatherAlertDeliveryLocalDataSource;

  constructor(dataSource: WeatherAlertDeliveryLocalDataSource) {
    this.dataSource = dataSource;
  }

  async upsertScheduled(deliveries: readonly WeatherAlertDeliveryRecord[]): Promise<void> {
    if (deliveries.some((delivery) =>
      !delivery.id || !delivery.localProfileId
      || !isUtcIsoTimestamp(delivery.fireAt) || !isUtcIsoTimestamp(delivery.createdAt))) {
      throw new Error('The weather alert delivery is invalid.');
    }
    await this.dataSource.upsertScheduled(deliveries);
  }

  async listFiredIds(localProfileId: string, now: string): Promise<ReadonlySet<string>> {
    if (!localProfileId || !isUtcIsoTimestamp(now)) {
      throw new Error('The weather alert delivery query is invalid.');
    }
    const records = await this.dataSource.listFired(localProfileId, now);
    if (records.some((record) => record.localProfileId !== localProfileId)) {
      throw new Error('The weather alert delivery record is invalid.');
    }
    return new Set(records.map(({ id }) => id));
  }

  async listPending(localProfileId: string, now: string): Promise<readonly WeatherAlertDeliveryRecord[]> {
    if (!localProfileId || !isUtcIsoTimestamp(now)) {
      throw new Error('The weather alert delivery query is invalid.');
    }
    const records = await this.dataSource.listPending(localProfileId, now);
    if (records.some((record) => record.localProfileId !== localProfileId)) {
      throw new Error('The weather alert delivery record is invalid.');
    }
    return records;
  }

  async deletePending(localProfileId: string, now: string, kind?: NotificationKind): Promise<void> {
    if (!localProfileId || !isUtcIsoTimestamp(now)) {
      throw new Error('The weather alert delivery query is invalid.');
    }
    await this.dataSource.deletePending(localProfileId, now, kind);
  }

  async pruneBefore(localProfileId: string, isoDate: string): Promise<void> {
    if (!localProfileId || !isUtcIsoTimestamp(isoDate)) {
      throw new Error('The weather alert delivery prune boundary is invalid.');
    }
    await this.dataSource.pruneBefore(localProfileId, isoDate);
  }
}
