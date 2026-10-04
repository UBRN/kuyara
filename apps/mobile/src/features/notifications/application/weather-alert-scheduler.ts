import { getDeviceTimeZone } from '@/domain/intl-format';
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
  deviceQuietHours,
  planWeatherAlerts,
  type WeatherAlertPlan,
} from '@/features/notifications/domain/weather-alerts';
import { weatherFreshness, type WeatherSnapshot } from '@/features/weather/domain/weather';
import type { TemperatureUnit } from '@/localization/device-locale';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { formatClockTime } from '@/presentation/format-clock-time';
import { formatWholeTemperature, formatWholeTemperatureRange } from '@/presentation/format-temperature';

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

function briefingCopy(
  plan: MorningBriefingPlan,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
  temperatureUnit: TemperatureUnit,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.morningBriefing;
  const { condition, coveredThrough, event, precipitationLikely } = plan.content;
  const range = formatWholeTemperatureRange(
    plan.content.minimumTemperatureCelsius,
    plan.content.maximumTemperatureCelsius,
    language,
    temperatureUnit,
  );
  const lead = coveredThrough === null
    ? copy.fullRange(range)
    : copy.partialRange({
      range,
      through: formatClockTime(coveredThrough, language, hour12, timeZone),
    });
  // The day's one event, when it has one, closes the sentence; a day without one falls back
  // to the sky the briefing hour opens with and claims nothing beyond it.
  let detail: string;
  if (event?.kind === 'precipitation_onset' || event?.kind === 'precipitation_easing') {
    const time = formatClockTime(event.atHour, language, hour12, timeZone);
    const snow = event.form === 'snow';
    detail = event.kind === 'precipitation_onset'
      ? (snow ? copy.snowStarting(time) : copy.rainStarting(time))
      : (snow ? copy.snowEasing(time) : copy.rainEasing(time));
  } else if (event?.kind === 'temperature_change') {
    const values = {
      time: formatClockTime(event.atHour, language, hour12, timeZone),
      temperature: formatWholeTemperature(event.toApparentCelsius, language, temperatureUnit),
    };
    detail = event.direction === 'drop' ? copy.temperatureDrop(values) : copy.temperatureRise(values);
  } else if (precipitationLikely) {
    detail = copy.wetMorning;
  } else {
    detail = ['clear', 'mostly_clear'].includes(condition) ? copy.clearMorning : copy.cloudyMorning;
  }
  return { title: copy.title, body: `${lead} ${detail}` };
}

function alertCopy(
  plan: WeatherAlertPlan,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
  temperatureUnit: TemperatureUnit,
): Readonly<{ title: string; body: string }> {
  const copy = messages[language].notifications.alerts;
  const time = formatClockTime(plan.crossingAt, language, hour12, timeZone);
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

/** Every enabled kind's plan for the snapshot, each with its copy in the input's unit. */
function plannedNotifications(
  input: RescheduleInput,
  snapshot: WeatherSnapshot,
  now: string,
  deliveredIds: ReadonlySet<string>,
): readonly Readonly<{ plan: WeatherAlertPlan | MorningBriefingPlan; title: string; body: string }>[] {
  const plans = input.weatherAlertsEnabled
    ? planWeatherAlerts({
      snapshot,
      now,
      quietHours: deviceQuietHours(getDeviceTimeZone() || 'UTC'),
      deliveredAlertIds: deliveredIds,
      leadTimeMinutes: input.leadTimeMinutes,
    })
    : [];
  const briefing = input.morningBriefingEnabled
    ? planMorningBriefing({ snapshot, now, deliveredIds })
    : null;
  return [
    ...plans.map((plan) => ({
      plan,
      ...alertCopy(plan, snapshot.timeZone, input.language, input.hour12, input.temperatureUnit),
    })),
    ...(briefing ? [{
      plan: briefing,
      ...briefingCopy(briefing, snapshot.timeZone, input.language, input.hour12, input.temperatureUnit),
    }] : []),
  ];
}

export class WeatherAlertScheduler implements WeatherAlertScheduling {
  private queuedInput: RescheduleInput | null = null;
  /**
   * The unit the pending notifications were written in, as far as this process knows. Every
   * unit change runs a reschedule, so the first run's unit is the one the stored preference
   * last wrote them in.
   */
  private writtenUnit: TemperatureUnit | null = null;
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
      // Without a snapshot nothing can be rewritten, so the old unit stays on record for the
      // next stale run that has one.
      if (snapshot && this.writtenUnit !== input.temperatureUnit) {
        if (this.writtenUnit !== null) await this.rewritePending(input, snapshot, now);
        this.writtenUnit = input.temperatureUnit;
      }
      return;
    }
    this.writtenUnit = input.temperatureUnit;
    // A failed cancellation leaves superseded alerts pending, so re-planning over it would
    // let them fire beside the new ones. Abort and leave the schedule and ledger as they are.
    if (!await this.gateway.cancelScheduledWeatherAlerts()) return;
    const repository = await this.repository;
    await repository.deletePending(input.localProfileId, now);
    if (!snapshot) return;

    const deliveredAlertIds = await repository.listFiredIds(input.localProfileId, now);

    // The ledger records what the OS accepted, not what was intended: a row for a
    // notification that was never scheduled would suppress the identity for the rest of
    // the day.
    const scheduled: WeatherAlertDeliveryRecord[] = [];
    for (const { plan, title, body } of plannedNotifications(input, snapshot, now, deliveredAlertIds)) {
      const accepted = await this.gateway.scheduleWeatherAlert({
        identifier: plan.id,
        fireAt: plan.fireAt,
        title,
        body,
      });
      if (!accepted) continue;
      scheduled.push({
        id: plan.id,
        localProfileId: input.localProfileId,
        fireAt: plan.fireAt,
        createdAt: now,
      });
    }

    await repository.upsertScheduled(scheduled);
    await repository.pruneBefore(
      input.localProfileId,
      new Date(Date.parse(now) - deliveryRetentionMilliseconds).toISOString(),
    );
  }

  /**
   * A stale snapshot cannot plan, but the notifications already pending were planned from it,
   * so their text is written again in the new unit under the same identifier and fire time.
   * Nothing is added or dropped; a pending notification the snapshot no longer reproduces keeps
   * its text.
   */
  private async rewritePending(input: RescheduleInput, snapshot: WeatherSnapshot, now: string) {
    const repository = await this.repository;
    const pending = new Map((await repository.listPending(input.localProfileId, now))
      .map(({ id, fireAt }) => [id, fireAt]));
    if (pending.size === 0) return;
    const deliveredIds = await repository.listFiredIds(input.localProfileId, now);
    for (const { plan, title, body } of plannedNotifications(input, snapshot, now, deliveredIds)) {
      const fireAt = pending.get(plan.id);
      if (fireAt !== undefined) {
        await this.gateway.scheduleWeatherAlert({ identifier: plan.id, fireAt, title, body });
      }
    }
  }
}
