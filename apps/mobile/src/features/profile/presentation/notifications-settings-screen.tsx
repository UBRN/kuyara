import { NativeList, NativeListSection, NativeListRow } from '@/components/ui';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import { useMessages } from '@/localization/use-messages';

// ADR 0030 section 5: one group today, an "Allow notifications" toggle tinted
// `brandPrimary`, plus a footer whose text changes and gains an "Open Settings" row when
// the system permission is denied. This retires the bare RN `Switch` the shipped screen
// used. The toggle keeps showing the stored preference, so an opt-in the OS blocks stays
// visible here while the Settings root row reads Off.
export type NotificationsSettingsScreenProps = Readonly<{
  optedIn: boolean;
  permission: NotificationPermissionState;
  /** True after an opt-in the OS refused, including a permission prompt left unanswered. */
  blocked: boolean;
  isBusy: boolean;
  onToggle: (optIn: boolean) => Promise<void>;
  onOpenSystemSettings: () => void;
}>;

export function NotificationsSettingsScreen({
  blocked,
  isBusy,
  onOpenSystemSettings,
  onToggle,
  optedIn,
  permission,
}: NotificationsSettingsScreenProps) {
  const messages = useMessages();
  // A refusal is remembered, but the permission outranks it: once the OS grants
  // notifications the footer stops claiming they are turned off in system settings.
  const showsDeniedHint = permission.kind === 'denied'
    || (blocked && permission.kind !== 'granted');

  return (
    <NativeList testID="settings-notifications-screen">
      <NativeListSection
        footer={showsDeniedHint
          ? messages.notifications.permissionDeniedHint
          : [
            messages.notifications.introduction,
            messages.notifications.leadTimeHint,
            messages.notifications.quietHoursHint,
          ].join(' ')}
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
        {showsDeniedHint ? (
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
