import { NativeList, NativeListSection, NativeListRow } from '@/components/ui';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import { useMessages } from '@/localization/use-messages';

// ADR 0030 section 5: one group today, an "Allow notifications" toggle tinted
// `brandPrimary`, plus a footer whose text changes and gains an "Open Settings" row when
// the system permission is denied. This retires the bare RN `Switch` the shipped screen
// used.
export type NotificationsSettingsScreenProps = Readonly<{
  optedIn: boolean;
  permission: NotificationPermissionState;
  isBusy: boolean;
  onToggle: (optIn: boolean) => Promise<void>;
  onOpenSystemSettings: () => void;
}>;

export function NotificationsSettingsScreen({
  isBusy,
  onOpenSystemSettings,
  onToggle,
  optedIn,
  permission,
}: NotificationsSettingsScreenProps) {
  const messages = useMessages();
  const isDenied = permission.kind === 'denied';

  return (
    <NativeList testID="settings-notifications-screen">
      <NativeListSection
        footer={isDenied
          ? messages.notifications.permissionDeniedHint
          : messages.notifications.introduction}
        testID="settings-notifications-toggle-group">
        <NativeListRow
          label={messages.notifications.toggleLabel}
          testID="settings-notifications-toggle-row"
          toggle={{
            disabled: isBusy,
            onValueChange: (value) => void onToggle(value),
            value: optedIn,
          }}
        />
        {isDenied ? (
          <NativeListRow
            label={messages.notifications.openSettingsAction}
            onPress={onOpenSystemSettings}
            testID="settings-notifications-open-settings"
            tinted
          />
        ) : null}
      </NativeListSection>
    </NativeList>
  );
}
