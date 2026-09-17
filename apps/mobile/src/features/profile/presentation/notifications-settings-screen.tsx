import { NativeList, NativeListSection, NativeListRow } from '@/components/ui';
import type { NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import { useMessages } from '@/localization/use-messages';

// ADR 0030 section 5 and ADR 0032 section 4: the first group is the "Allow notifications"
// toggle tinted `brandPrimary`, plus a footer whose text changes and gains an "Open
// Settings" row when the system permission is denied. The morning briefing is the second
// group ADR 0032 left room for, underneath and with its own footer, so neither row moved.
// Each toggle keeps showing its own stored preference, so an opt-in the OS blocks stays
// visible here while the Settings root row reads Off.
export type NotificationsSettingsScreenProps = Readonly<{
  optedIn: boolean;
  morningBriefingOptedIn: boolean;
  permission: NotificationPermissionState;
  /** True after an opt-in the OS refused, including a permission prompt left unanswered. */
  blocked: boolean;
  isBusy: boolean;
  onToggle: (optIn: boolean) => Promise<void>;
  onToggleMorningBriefing: (optIn: boolean) => Promise<void>;
  onOpenSystemSettings: () => void;
}>;

export function NotificationsSettingsScreen({
  blocked,
  isBusy,
  morningBriefingOptedIn,
  onOpenSystemSettings,
  onToggle,
  onToggleMorningBriefing,
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
      <NativeListSection
        footer={messages.notifications.morningBriefing.hint}
        testID="settings-morning-briefing-group">
        <NativeListRow
          label={messages.notifications.morningBriefing.toggleLabel}
          testID="settings-morning-briefing-toggle-row"
          toggle={{
            disabled: isBusy,
            onValueChange: (value) => void onToggleMorningBriefing(value),
            value: morningBriefingOptedIn,
          }}
        />
      </NativeListSection>
    </NativeList>
  );
}
