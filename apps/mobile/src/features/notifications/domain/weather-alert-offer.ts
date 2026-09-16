import {
  defaultQuietHours,
  planWeatherAlerts,
  type WeatherAlertRuleId,
} from '@/features/notifications/domain/weather-alerts';
import { weatherFreshness, type WeatherSnapshot } from '@/features/weather/domain/weather';

/**
 * ADR 0004: the opt-in also has one contextual offer on Today, made at a moment an alert
 * would have fired and never made again. The rules are ADR 0032's, planned here rather than
 * restated: an offer exists exactly when a real alert would have been planned for the person
 * had they been opted in.
 */
export type WeatherAlertOffer =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'offer'; ruleId: WeatherAlertRuleId }>;

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
  // claim one would have fired either.
  if (weatherFreshness(snapshot.fetchedAt, now) !== 'fresh') return noOffer;

  // Nothing was delivered, because nothing was ever scheduled: the person is not opted in.
  const [plan] = planWeatherAlerts({
    snapshot,
    now,
    quietHours: { ...defaultQuietHours, timeZone: input.timeZone },
    deliveredAlertIds: new Set<string>(),
  });

  return plan ? Object.freeze({ kind: 'offer', ruleId: plan.ruleId }) : noOffer;
}
