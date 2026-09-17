import { planMorningBriefing } from '@/features/notifications/domain/morning-briefing';
import {
  defaultQuietHours,
  planWeatherAlerts,
  type WeatherAlertRuleId,
} from '@/features/notifications/domain/weather-alerts';
import { weatherFreshness, type WeatherSnapshot } from '@/features/weather/domain/weather';

/**
 * ADR 0004: the opt-in also has one contextual offer on Today, made at a moment a
 * notification would have been sent and never made again. The rules are ADR 0032's for the
 * alerts and ADR 0004's for the briefing, planned here rather than restated: an offer exists
 * exactly when a real notification would have been planned for the person had they been
 * opted in. Because the briefing is planned every day, the offer arrives on the first fresh
 * morning rather than waiting for a rare rule crossing.
 */
export type WeatherAlertOfferReason = WeatherAlertRuleId | 'morning_briefing';

export type WeatherAlertOffer =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'offer'; ruleId: WeatherAlertOfferReason }>;

const noOffer: WeatherAlertOffer = Object.freeze({ kind: 'none' });

export function weatherAlertOfferState(input: Readonly<{
  optedIn: boolean;
  /** The durable profile flag: the offer was accepted or dismissed once already. */
  alreadyOffered: boolean;
  snapshot: WeatherSnapshot | null;
  now: string;
  /** The device's time zone, which is what quiet hours are evaluated in. */
  timeZone: string;
}>): WeatherAlertOffer {
  const { alreadyOffered, now, optedIn, snapshot } = input;
  if (optedIn || alreadyOffered || snapshot === null) return noOffer;
  // ADR 0032 section 6: a stale or invalid snapshot never plans an alert, so it must not
  // claim one would have fired either. The briefing is planned under the same gate.
  if (weatherFreshness(snapshot.fetchedAt, now) !== 'fresh') return noOffer;

  // Nothing was delivered, because nothing was ever scheduled: the person is not opted in.
  const delivered = new Set<string>();
  const [plan] = planWeatherAlerts({
    snapshot,
    now,
    quietHours: { ...defaultQuietHours, timeZone: input.timeZone },
    deliveredAlertIds: delivered,
  });
  // An alert is about the next few hours and the briefing is about tomorrow, so a day that
  // has both is named by the nearer one.
  if (plan) return Object.freeze({ kind: 'offer', ruleId: plan.ruleId });

  return planMorningBriefing({ snapshot, now, deliveredIds: delivered })
    ? Object.freeze({ kind: 'offer', ruleId: 'morning_briefing' })
    : noOffer;
}
