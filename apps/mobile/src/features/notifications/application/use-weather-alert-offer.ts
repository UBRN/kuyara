import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { getDeviceTimeZone } from '@/domain/intl-format';
import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import {
  weatherAlertOfferState,
  type WeatherAlertOffer,
} from '@/features/notifications/domain/weather-alert-offer';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { useForegroundClock } from '@/hooks/use-foreground-clock';

const OFFER_CLOCK_TICK_MS = 60_000;

export type WeatherAlertOfferApplication = Readonly<{
  offer: WeatherAlertOffer;
  /**
   * Runs the Settings opt-in flow, OS permission prompt included, turns both notification
   * kinds on, and closes the offer.
   */
  acceptOffer: () => Promise<NotificationOptInOutcome>;
  /** Closes the offer without opting in. It is never made again. */
  dismissOffer: () => Promise<void>;
  /**
   * True once a refused accept was finished because the permission was later granted in
   * system Settings: both kinds are on, so the refusal's explanation no longer applies.
   */
  finishedInSettings: boolean;
}>;

/**
 * Today's side of ADR 0004's contextual offer. It reads the profile, the weather and the
 * notification application the same way the alert observer does, and answers whether the
 * offer should be on screen right now.
 */
export function useWeatherAlertOffer(): WeatherAlertOfferApplication {
  const notificationApplication = useNotificationApplication();
  const profileApplication = useProfileApplication();
  const weatherApplication = useWeatherApplication();
  const now = useForegroundClock(OFFER_CLOCK_TICK_MS);

  const profile = profileApplication.state.status === 'ready'
    ? profileApplication.state.profile
    : null;
  // Only the active place's snapshot can make the offer: one kept from the previous place
  // says nothing about the weather a notification would have been about.
  const snapshot = weatherApplication.state.status === 'ready'
    ? activeLocationSnapshot(weatherApplication.state.snapshot, weatherApplication.state.activeLocation)
    : null;
  // Turning on either kind in Settings is an answer to the offer's question already.
  const optedIn = (profile?.notificationsOptIn ?? false) || (profile?.morningBriefingOptIn ?? false);
  // No profile means no durable answer to read, so nothing is offered until it loads.
  const alreadyOffered = profile?.weatherAlertOfferShown ?? true;

  const offer = useMemo(
    () => weatherAlertOfferState({
      optedIn,
      alreadyOffered,
      snapshot,
      now: new Date(now).toISOString(),
      timeZone: getDeviceTimeZone() || 'UTC',
    }),
    [alreadyOffered, now, optedIn, snapshot],
  );

  const awaitingSettings = useRef(false);
  const [finishedInSettings, setFinishedInSettings] = useState(false);
  // Already stable, and already exactly what dismissing the offer does.
  const {
    markWeatherAlertOfferShown: dismissOffer,
    updateMorningBriefingOptIn,
  } = profileApplication;
  const acceptOffer = useCallback(async () => {
    // Marked first: the offer is spent whatever the OS answers, so a denied permission
    // cannot turn the one offer into a recurring prompt.
    await dismissOffer();
    const result = await notificationApplication.setOptIn(true);
    // ADR 0004: accepting turns both kinds on, whichever of them the offer named. The
    // permission is already granted here, so the briefing only needs its stored answer.
    if (result.outcome === 'enabled') await updateMorningBriefingOptIn(true);
    if (result.outcome === 'blocked') awaitingSettings.current = true;
    return result;
  }, [dismissOffer, notificationApplication, updateMorningBriefingOptIn]);

  // A refused accept stored no opt-in. If the person then grants the permission in system
  // Settings, the provider re-reads it on return and this finishes the accept exactly as an
  // immediate grant would have: the same two opt-ins, which the alert observer then plans.
  const granted = notificationApplication.state.permission.kind === 'granted';
  const finishAccept = useEffectEvent(async () => {
    try {
      const result = await notificationApplication.setOptIn(true);
      if (result.outcome !== 'enabled') return;
      await updateMorningBriefingOptIn(true);
      setFinishedInSettings(true);
    } catch {
      // The opt-in stays one tap away in Settings, so a failed write is not retried here.
    }
  });
  useEffect(() => {
    if (!awaitingSettings.current || !granted) return;
    awaitingSettings.current = false;
    void finishAccept();
  }, [granted]);

  return { offer, acceptOffer, dismissOffer, finishedInSettings };
}
