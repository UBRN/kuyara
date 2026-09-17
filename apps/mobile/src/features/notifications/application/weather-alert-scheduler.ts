import type { NotificationGateway } from '@/features/notifications/data/notification-gateway';
import type { WeatherAlertDeliveryRecord } from '@/features/notifications/data/weather-alert-delivery-record';
import type { WeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import {
  planMorningBriefing,
  type MorningBriefingPlan,
} from '@/features/notifications/domain/morning-briefing';
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
  /** ADR 0032 section 6: opted in to weather alerts and allowed by the OS. */
  weatherAlertsEnabled: boolean;
  /** ADR 0004: the morning briefing's own opt-in, and the same OS permission. */
  morningBriefingEnabled: boolean;
  language: SupportedLanguage;
  /** The device's 12/24-hour clock setting, which the user sets apart from the language. */
  hour12: boolean;
  /** Defaults to the foreground lead of ADR 0032 section 3. */
  leadTimeMinutes?: number;
}>;

export interface WeatherAlertScheduling {
  reschedule(input: RescheduleInput): Promise<void>;
}

const deliveryRetentionMilliseconds = 3 * 24 * 60 * 60 * 1000;

// The notification reads on the lock screen beside the system clock, so the crossing wears
// the clock the device is set to rather than a fixed 24-hour one.
function crossingTime(
  plan: WeatherAlertPlan,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(new Date(plan.crossingAt));
}

function briefingCopy(
  plan: MorningBriefingPlan,
  language: SupportedLanguage,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.morningBriefing;
  const { condition, precipitationLikely } = plan.content;
  // The same locale pair `crossingTime` uses, so a below-zero morning reads with the
  // locale's own minus sign. The copy owns the unit and the single-value form; a one-hour
  // morning window has one temperature and must not read as a range of it to itself.
  const format = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    maximumFractionDigits: 0,
  });
  const temperatures = {
    low: format.format(Math.round(plan.content.minimumTemperatureCelsius)),
    high: format.format(Math.round(plan.content.maximumTemperatureCelsius)),
  };
  if (precipitationLikely) return { title: copy.title, body: copy.wetBody(temperatures) };
  return ['clear', 'mostly_clear'].includes(condition)
    ? { title: copy.title, body: copy.clearBody(temperatures) }
    : { title: copy.title, body: copy.cloudyBody(temperatures) };
}

function alertCopy(
  plan: WeatherAlertPlan,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.alerts;
  const time = crossingTime(plan, timeZone, language, hour12);
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
    const anyKindEnabled = input.weatherAlertsEnabled || input.morningBriefingEnabled;
    const snapshot = anyKindEnabled ? input.snapshot : null;
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
    const plans = input.weatherAlertsEnabled
      ? planWeatherAlerts({
        snapshot,
        now,
        quietHours: { ...defaultQuietHours, timeZone },
        deliveredAlertIds,
        leadTimeMinutes: input.leadTimeMinutes,
      })
      : [];
    const briefing = input.morningBriefingEnabled
      ? planMorningBriefing({ snapshot, now, deliveredIds: deliveredAlertIds })
      : null;

    // The ledger records what the OS accepted, not what was intended: a row for a
    // notification that was never scheduled would suppress the identity for the rest of
    // the day.
    const scheduled: WeatherAlertDeliveryRecord[] = [];
    const schedule = async (
      plan: WeatherAlertPlan | MorningBriefingPlan,
      copy: Readonly<{ title: string; body: string }>,
    ) => {
      const accepted = await this.gateway.scheduleWeatherAlert({
        identifier: plan.id,
        fireAt: plan.fireAt,
        title: copy.title,
        body: copy.body,
      });
      if (!accepted) return;
      scheduled.push({
        id: plan.id,
        localProfileId: input.localProfileId,
        fireAt: plan.fireAt,
        createdAt: now,
      });
    };

    for (const plan of plans) {
      await schedule(plan, alertCopy(plan, snapshot.timeZone, input.language, input.hour12));
    }
    if (briefing) await schedule(briefing, briefingCopy(briefing, input.language));

    await repository.upsertScheduled(scheduled);
    await repository.pruneBefore(
      input.localProfileId,
      new Date(Date.parse(now) - deliveryRetentionMilliseconds).toISOString(),
    );
  }
}
