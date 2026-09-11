import type { NotificationGateway } from '@/features/notifications/data/notification-gateway';
import type { WeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import {
  defaultQuietHours,
  planWeatherAlerts,
  type WeatherAlertPlan,
} from '@/features/notifications/domain/weather-alerts';
import { weatherFreshness, type WeatherSnapshot } from '@/features/weather/domain/weather';
import { messages, type SupportedLanguage } from '@/localization/messages';

type RescheduleInput = Readonly<{
  localProfileId: string;
  snapshot: WeatherSnapshot | null;
  enabled: boolean;
  language: SupportedLanguage;
  /** Defaults to the foreground lead of ADR 0032 section 3. */
  leadTimeMinutes?: number;
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
    const now = this.now();
    const snapshot = input.enabled ? input.snapshot : null;
    // A stale or invalid snapshot is hours old, so its hours and its temperature baseline
    // are not the ones to plan from. Nothing is cancelled and nothing is written: the
    // previous schedule stands until a refresh brings a fresh snapshot.
    if (snapshot && weatherFreshness(snapshot.fetchedAt, now) !== 'fresh') return;
    // A failed cancellation leaves superseded alerts pending, so re-planning over it would
    // let them fire beside the new ones. Abort and leave the schedule and ledger as they are.
    if (!await this.gateway.cancelScheduledWeatherAlerts()) return;
    const repository = await this.repository;
    await repository.deletePending(input.localProfileId, now);
    if (!snapshot) return;

    const deliveredAlertIds = await repository.listFiredIds(input.localProfileId, now);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const plans = planWeatherAlerts({
      snapshot,
      now,
      quietHours: { ...defaultQuietHours, timeZone },
      deliveredAlertIds,
      leadTimeMinutes: input.leadTimeMinutes,
    });

    // The ledger records what the OS accepted, not what was intended: a row for an alert
    // that was never scheduled would suppress the identity for the rest of the day.
    const scheduled: WeatherAlertPlan[] = [];
    for (const plan of plans) {
      const copy = alertCopy(plan, snapshot.timeZone, input.language);
      const accepted = await this.gateway.scheduleWeatherAlert({
        identifier: plan.id,
        fireAt: plan.fireAt,
        title: copy.title,
        body: copy.body,
      });
      if (accepted) scheduled.push(plan);
    }

    await repository.upsertScheduled(scheduled.map((plan) => ({
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
