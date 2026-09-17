import { useCallback, useMemo } from 'react';

import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import {
  weatherAlertOfferState,
  type WeatherAlertOffer,
} from '@/features/notifications/domain/weather-alert-offer';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useForegroundClock } from '@/hooks/use-foreground-clock';

const OFFER_CLOCK_TICK_MS = 60_000;

export type WeatherAlertOfferApplication = Readonly<{
  offer: WeatherAlertOffer;
  /** Runs the Settings opt-in flow, OS permission prompt included, and closes the offer. */
  acceptOffer: () => Promise<NotificationOptInOutcome>;
  /** Closes the offer without opting in. It is never made again. */
  dismissOffer: () => Promise<void>;
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
  const snapshot = weatherApplication.state.status === 'ready'
    ? weatherApplication.state.snapshot
    : null;
  const optedIn = profile?.notificationsOptIn ?? false;
  // No profile means no durable answer to read, so nothing is offered until it loads.
  const alreadyOffered = profile?.weatherAlertOfferShown ?? true;

  const offer = useMemo(
    () => weatherAlertOfferState({
      optedIn,
      alreadyOffered,
      snapshot,
      now: new Date(now).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
    [alreadyOffered, now, optedIn, snapshot],
  );

  // Already stable, and already exactly what dismissing the offer does.
  const { markWeatherAlertOfferShown: dismissOffer } = profileApplication;
  const acceptOffer = useCallback(async () => {
    // Marked first: the offer is spent whatever the OS answers, so a denied permission
    // cannot turn the one offer into a recurring prompt.
    await dismissOffer();
    return notificationApplication.setOptIn(true);
  }, [dismissOffer, notificationApplication]);

  return { offer, acceptOffer, dismissOffer };
}
