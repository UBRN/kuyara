import type {
  NotificationGateway,
  NotificationKind,
} from '@/features/notifications/data/notification-gateway';
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
import type { TemperatureUnit } from '@/localization/device-locale';
import { localeTag } from '@/localization/locale-tag';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { formatWholeTemperature } from '@/presentation/format-temperature';

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
  temperatureUnit: TemperatureUnit;
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
  return new Intl.DateTimeFormat(localeTag(language), {
    timeZone,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(new Date(plan.crossingAt));
}

function briefingCopy(
  plan: MorningBriefingPlan,
  language: SupportedLanguage,
  temperatureUnit: TemperatureUnit,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.morningBriefing;
  const { condition, precipitationLikely } = plan.content;
  // Compare the displayed values so a converted range that rounds to one degree
  // reads as one temperature.
  const temperatures = {
    low: formatWholeTemperature(plan.content.minimumTemperatureCelsius, language, temperatureUnit),
    high: formatWholeTemperature(plan.content.maximumTemperatureCelsius, language, temperatureUnit),
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
  temperatureUnit: TemperatureUnit,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.alerts;
  const time = crossingTime(plan, timeZone, language, hour12);
  if (plan.detail.kind === 'precipitation') {
    return plan.detail.form === 'snow'
      ? { title: copy.snowTitle, body: copy.snowBody(time) }
      : { title: copy.rainTitle, body: copy.rainBody(time) };
  }
  const temperature = formatWholeTemperature(plan.detail.toApparentCelsius, language, temperatureUnit);
  return plan.detail.direction === 'drop'
    ? { title: copy.dropTitle, body: copy.dropBody({ time, temperature }) }
    : { title: copy.riseTitle, body: copy.riseBody({ time, temperature }) };
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
    // A failed run must not strand the input queued behind it: that one may be the opt-out
    // whose cancellation the failed run never reached. Drain first, then report the first failure.
    let failure: { error: unknown } | null = null;
    while (this.queuedInput) {
      const input = this.queuedInput;
      this.queuedInput = null;
      try {
        await this.run(input);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  }

  private async run(input: RescheduleInput): Promise<void> {
    const now = this.now();
    const anyKindEnabled = input.weatherAlertsEnabled || input.morningBriefingEnabled;
    const snapshot = anyKindEnabled ? input.snapshot : null;
    // A stale snapshot cannot plan enabled kinds. Disabled kinds still lose their own
    // pending notifications immediately, while the enabled kind keeps its last schedule.
    if (anyKindEnabled && (!snapshot || weatherFreshness(snapshot.fetchedAt, now) !== 'fresh')) {
      for (const [enabled, kind] of [
        [input.weatherAlertsEnabled, 'weather_alert'],
        [input.morningBriefingEnabled, 'morning_briefing'],
      ] as const satisfies readonly (readonly [boolean, NotificationKind])[]) {
        if (enabled) continue;
        if (!await this.gateway.cancelScheduledWeatherAlerts(kind)) return;
        await (await this.repository).deletePending(input.localProfileId, now, kind);
      }
      return;
    }
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
      await schedule(plan, alertCopy(plan, snapshot.timeZone, input.language, input.hour12, input.temperatureUnit));
    }
    if (briefing) await schedule(briefing, briefingCopy(briefing, input.language, input.temperatureUnit));

    await repository.upsertScheduled(scheduled);
    await repository.pruneBefore(
      input.localProfileId,
      new Date(Date.parse(now) - deliveryRetentionMilliseconds).toISOString(),
    );
  }
}
