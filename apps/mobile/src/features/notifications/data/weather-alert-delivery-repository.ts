import type { WeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/weather-alert-delivery-local-data-source';
import type { WeatherAlertDeliveryRecord } from '@/features/notifications/data/weather-alert-delivery-record';

export interface WeatherAlertDeliveryRepository {
  upsertScheduled(deliveries: readonly WeatherAlertDeliveryRecord[]): Promise<void>;
  deletePending(localProfileId: string, now: string): Promise<void>;
  listFiredIds(localProfileId: string, now: string): Promise<ReadonlySet<string>>;
  pruneBefore(localProfileId: string, isoDate: string): Promise<void>;
}

function isIsoDate(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
      || !isIsoDate(delivery.fireAt) || !isIsoDate(delivery.createdAt))) {
      throw new Error('The weather alert delivery is invalid.');
    }
    await this.dataSource.upsertScheduled(deliveries);
  }

  async listFiredIds(localProfileId: string, now: string): Promise<ReadonlySet<string>> {
    if (!localProfileId || !isIsoDate(now)) {
      throw new Error('The weather alert delivery query is invalid.');
    }
    const records = await this.dataSource.listFired(localProfileId, now);
    if (records.some((record) => record.localProfileId !== localProfileId)) {
      throw new Error('The weather alert delivery record is invalid.');
    }
    return new Set(records.map(({ id }) => id));
  }

  async deletePending(localProfileId: string, now: string): Promise<void> {
    if (!localProfileId || !isIsoDate(now)) {
      throw new Error('The weather alert delivery query is invalid.');
    }
    await this.dataSource.deletePending(localProfileId, now);
  }

  async pruneBefore(localProfileId: string, isoDate: string): Promise<void> {
    if (!localProfileId || !isIsoDate(isoDate)) {
      throw new Error('The weather alert delivery prune boundary is invalid.');
    }
    await this.dataSource.pruneBefore(localProfileId, isoDate);
  }
}
