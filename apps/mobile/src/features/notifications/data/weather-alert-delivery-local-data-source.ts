import type { WeatherAlertDeliveryRecord } from '@/features/notifications/data/weather-alert-delivery-record';

export interface WeatherAlertDeliveryLocalDataSource {
  upsertScheduled(records: readonly WeatherAlertDeliveryRecord[]): Promise<void>;
  deletePending(localProfileId: string, now: string): Promise<void>;
  listFired(localProfileId: string, now: string): Promise<readonly WeatherAlertDeliveryRecord[]>;
  pruneBefore(localProfileId: string, isoDate: string): Promise<void>;
}
