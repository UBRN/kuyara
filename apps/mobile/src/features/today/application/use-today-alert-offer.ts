import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useWeatherAlertOffer } from '@/features/notifications/application/use-weather-alert-offer';
import { useProfileApplication } from '@/features/profile/application/profile-context';

/**
 * ADR 0004: the one contextual offer, decided, with its actions, or null when Today shows none.
 * The reason, the durable flag and the opt-in flow live behind `useWeatherAlertOffer`, which
 * persists and emits nothing; this hook reports the same events the Settings Notifications
 * route reports for the same opt-in, plus taxonomy 5.13's `weather_alert_offer_resolved` for
 * how the offer itself was answered.
 */
export function useTodayAlertOffer(openNotificationSettings: () => void) {
  const { acceptOffer, dismissOffer, offer } = useWeatherAlertOffer();
  const { openApplicationSettings } = useNotificationApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  if (offer.kind !== 'offer') return null;

  const accept = async () => {
    // Read before the accept runs: it turns the briefing on, and taxonomy 5.9 only records a
    // setting that really changed.
    const briefingWasOn = profileState.status === 'ready' && profileState.profile.morningBriefingOptIn;
    const result = await acceptOffer();
    analytics.capture('weather_alert_offer_resolved', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outcome: 'accepted',
      kind: offer.ruleId,
    });
    if (result.outcome === 'blocked') {
      analytics.capture('notification_permission_resolved', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        outcome: 'blocked',
        can_request_again: result.canRequestAgain,
      });
      return result;
    }
    if (result.outcome !== 'enabled') return result;
    analytics.capture('notification_permission_resolved', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outcome: 'enabled',
    });
    // The offer only exists while weather alerts are off, so that preference really changed;
    // the briefing may already have been on from Settings.
    analytics.capture('setting_changed', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      setting_name: 'notifications_enabled',
      new_value: true,
    });
    if (!briefingWasOn) {
      analytics.capture('setting_changed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        setting_name: 'morning_briefing_enabled',
        new_value: true,
      });
    }
    if (await firstUses.markFirstUse('notifications')) {
      analytics.capture('feature_used_first_time', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        feature_name: 'notifications',
      });
    }
    // An accepted offer ends on the Notifications surface, where both kinds are now on and
    // either can be turned off in one tap. A refused permission stays on Today, where the row
    // explains itself.
    openNotificationSettings();
    return result;
  };

  const dismiss = async () => {
    await dismissOffer();
    analytics.capture('weather_alert_offer_resolved', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outcome: 'dismissed',
      kind: offer.ruleId,
    });
  };

  return {
    ruleId: offer.ruleId,
    onAccept: accept,
    onDismiss: dismiss,
    onOpenSystemSettings: () => void openApplicationSettings(),
  };
}
