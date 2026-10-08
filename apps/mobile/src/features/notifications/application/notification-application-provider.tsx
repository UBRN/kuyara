import { router } from 'expo-router';
import { AppState } from 'react-native';
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { getDeviceTimeZone } from '@/domain/intl-format';
import { systemNow } from '@/infrastructure/system-clock';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { NotificationApplicationController } from '@/features/notifications/application/notification-application-controller';
import {
  NotificationApplicationContext,
  type NotificationApplicationValue,
} from '@/features/notifications/application/notification-context';
import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';
import type { NotificationGateway } from '@/features/notifications/data/notification-gateway';
import { WeatherAlertScheduler, type WeatherAlertScheduling } from '@/features/notifications/application/weather-alert-scheduler';
import { loadWeatherAlertDeliveryRepository } from '@/features/notifications/application/weather-alert-delivery-repository-loader';
import { loadWeatherRepository } from '@/features/weather/application/weather-repository-loader';

type NotificationApplicationProviderProps = PropsWithChildren<{
  notificationsOptIn: boolean;
  persistOptIn: (optIn: boolean) => Promise<void>;
  gateway?: NotificationGateway;
  weatherAlertScheduler?: WeatherAlertScheduling;
}>;

export function NotificationApplicationProvider(
  props: NotificationApplicationProviderProps,
) {
  const defaultGateway = useMemo(() => new ExpoNotificationGateway(), []);
  const gateway = props.gateway ?? defaultGateway;
  const controller = useMemo(
    () => new NotificationApplicationController(gateway, props.persistOptIn),
    [gateway, props.persistOptIn],
  );
  const defaultWeatherAlertScheduler = useMemo(
    () => new WeatherAlertScheduler(
      gateway,
      loadWeatherAlertDeliveryRepository(),
      systemNow,
      getDeviceTimeZone,
      async (localProfileId, locationKey) => (await loadWeatherRepository())
        .getSnapshot(localProfileId, locationKey),
    ),
    [gateway],
  );
  const weatherAlertScheduler = props.weatherAlertScheduler ?? defaultWeatherAlertScheduler;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.refreshPermission();
    });
    return () => subscription.remove();
  }, [controller]);

  const { analytics } = useProductAnalytics();
  const [openedNotifications, setOpenedNotifications] = useState(0);
  useEffect(
    () => gateway.subscribeToResponses((kind) => {
      // Taxonomy 5.13: a tapped local notification, named by kind only, with no rule,
      // time or content attached. The tap can open a process iOS started in the background,
      // whose analytics client is built only as it opens, so the event waits for it.
      void analytics.whenReady().then(() => analytics.capture('notification_opened', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        kind,
      }));
      setOpenedNotifications((count) => count + 1);
      router.navigate('/');
    }),
    [analytics, gateway],
  );

  const value = useMemo<NotificationApplicationValue>(() => ({
    state,
    setOptIn: (optIn) => controller.setOptIn(optIn),
    requestPermission: () => controller.requestPermission(),
    openApplicationSettings: () => gateway.openApplicationSettings(),
    weatherAlertScheduler,
    openedNotifications,
  }), [controller, gateway, openedNotifications, state, weatherAlertScheduler]);

  return (
    <NotificationApplicationContext value={value}>
      {props.children}
    </NotificationApplicationContext>
  );
}
