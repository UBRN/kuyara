import type { NotificationGateway } from '@/features/notifications/data/notification-gateway';
import type { WeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import {
  defaultQuietHours,
  planWeatherAlerts,
  type WeatherAlertPlan,
} from '@/features/notifications/domain/weather-alerts';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { messages, type SupportedLanguage } from '@/localization/messages';

type RescheduleInput = Readonly<{
  localProfileId: string;
  snapshot: WeatherSnapshot | null;
  enabled: boolean;
  language: SupportedLanguage;
}>;

export interface WeatherAlertScheduling {
  reschedule(input: RescheduleInput): Promise<void>;
}

const deliveryRetentionMilliseconds = 3 * 24 * 60 * 60 * 1000;

function crossingTime(plan: WeatherAlertPlan, timeZone: string, language: SupportedLanguage) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(plan.crossingAt));
}

function alertCopy(
  plan: WeatherAlertPlan,
  timeZone: string,
  language: SupportedLanguage,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.alerts;
  const time = crossingTime(plan, timeZone, language);
  if (plan.detail.kind === 'precipitation') {
    return plan.detail.form === 'snow'
      ? { title: copy.snowTitle, body: copy.snowBody(time) }
      : { title: copy.rainTitle, body: copy.rainBody(time) };
  }
  const temperatureCelsius = Math.round(plan.detail.toApparentCelsius);
  return plan.detail.direction === 'drop'
    ? { title: copy.dropTitle, body: copy.dropBody({ time, temperatureCelsius }) }
    : { title: copy.riseTitle, body: copy.riseBody({ time, temperatureCelsius }) };
}

export class WeatherAlertScheduler implements WeatherAlertScheduling {
  private queuedInput: RescheduleInput | null = null;
  private running: Promise<void> | null = null;
  private readonly gateway: NotificationGateway;
  private readonly repository: WeatherAlertDeliveryRepository
    | Promise<WeatherAlertDeliveryRepository>;
  private readonly now: () => string;

  constructor(
    gateway: NotificationGateway,
    repository: WeatherAlertDeliveryRepository | Promise<WeatherAlertDeliveryRepository>,
    now: () => string,
  ) {
    this.gateway = gateway;
    this.repository = repository;
    this.now = now;
  }

  reschedule(input: RescheduleInput): Promise<void> {
    this.queuedInput = input;
    if (!this.running) {
      const running = this.runQueued().finally(() => {
        if (this.running === running) this.running = null;
      });
      this.running = running;
    }
    return this.running;
  }

  private async runQueued(): Promise<void> {
    while (this.queuedInput) {
      const input = this.queuedInput;
      this.queuedInput = null;
      await this.run(input);
    }
  }

  private async run(input: RescheduleInput): Promise<void> {
    await this.gateway.cancelScheduledWeatherAlerts();
    const now = this.now();
    const repository = await this.repository;
    await repository.deletePending(input.localProfileId, now);
    if (!input.enabled || !input.snapshot) return;

    const deliveredAlertIds = await repository.listFiredIds(input.localProfileId, now);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const plans = planWeatherAlerts({
      snapshot: input.snapshot,
      now,
      quietHours: { ...defaultQuietHours, timeZone },
      deliveredAlertIds,
    });

    for (const plan of plans) {
      const copy = alertCopy(plan, input.snapshot.timeZone, input.language);
      await this.gateway.scheduleWeatherAlert({
        identifier: plan.id,
        fireAt: plan.fireAt,
        title: copy.title,
        body: copy.body,
      });
    }

    await repository.upsertScheduled(plans.map((plan) => ({
      id: plan.id,
      localProfileId: input.localProfileId,
      fireAt: plan.fireAt,
      createdAt: now,
    })));
    await repository.pruneBefore(
      input.localProfileId,
      new Date(Date.parse(now) - deliveryRetentionMilliseconds).toISOString(),
    );
  }
}
