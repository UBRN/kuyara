import type { ReactNode } from 'react';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { tint } from '@expo/ui/swift-ui/modifiers';

import { useKuyaraTheme } from '@/theme/theme-context';

const swiftUI = Platform.select<() => typeof import('@expo/ui/swift-ui') | null>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep SwiftUI off Android.
  ios: () => require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui'),
  default: () => null,
})();
const jetpackCompose = Platform.select<
  () => typeof import('@expo/ui/jetpack-compose') | null
>({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep Compose off iOS.
  android: () => require('@expo/ui/jetpack-compose') as typeof import('@expo/ui/jetpack-compose'),
  default: () => null,
})();

export type NativeMenuItem = Readonly<{
  id: string;
  label: string;
  selected?: boolean;
}>;

export type NativeMenuProps = Readonly<{
  items: readonly NativeMenuItem[];
  onSelect: (id: string) => void;
  /** The React Native trigger content, rendered inside the platform host. */
  children: ReactNode;
  /** Explicit size for the host; `Host matchContents` collapses inside a ScrollView. */
  width: number;
  height: number;
  hitSlop?: number;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}>;

export function NativeMenu({
  accessibilityHint,
  accessibilityLabel,
  children,
  height,
  hitSlop,
  items,
  onSelect,
  testID,
  width,
}: NativeMenuProps) {
  const theme = useKuyaraTheme();
  const [expanded, setExpanded] = useState(false);
  const colorScheme = theme.isDark ? 'dark' : 'light';

  const selectItem = (item: NativeMenuItem) => {
    setExpanded(false);
    if (!item.selected) onSelect(item.id);
  };
  const trigger = (onPress?: () => void) => (
    <Pressable
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={hitSlop}
      onPress={onPress}
      style={{ height, width }}
      testID={testID}>
      {children}
    </Pressable>
  );

  if (swiftUI) {
    return (
      <swiftUI.Host colorScheme={colorScheme} style={{ height, width }}>
        <swiftUI.Menu
          label={<swiftUI.RNHostView>{trigger()}</swiftUI.RNHostView>}
          modifiers={[tint(theme.colors.brandPrimary)]}>
          {items.map((item) => (
            <swiftUI.Button
              key={item.id}
              label={item.label}
              onPress={() => selectItem(item)}
              systemImage={item.selected ? 'checkmark' : undefined}
            />
          ))}
        </swiftUI.Menu>
      </swiftUI.Host>
    );
  }

  if (jetpackCompose) {
    return (
      <jetpackCompose.Host colorScheme={colorScheme} style={{ height, width }}>
        <jetpackCompose.DropdownMenu
          expanded={expanded}
          onDismissRequest={() => setExpanded(false)}>
          <jetpackCompose.DropdownMenu.Trigger>
            <jetpackCompose.RNHostView matchContents>
              {trigger(() => setExpanded(true))}
            </jetpackCompose.RNHostView>
          </jetpackCompose.DropdownMenu.Trigger>
          <jetpackCompose.DropdownMenu.Items>
            {items.map((item) => (
              <jetpackCompose.DropdownMenuItem
                key={item.id}
                onClick={() => selectItem(item)}>
                <jetpackCompose.DropdownMenuItem.Text>
                  <jetpackCompose.Text>
                    {item.selected ? `✓ ${item.label}` : item.label}
                  </jetpackCompose.Text>
                </jetpackCompose.DropdownMenuItem.Text>
              </jetpackCompose.DropdownMenuItem>
            ))}
          </jetpackCompose.DropdownMenu.Items>
        </jetpackCompose.DropdownMenu>
      </jetpackCompose.Host>
    );
  }

  const nextItem = items.find((item) => !item.selected);
  return trigger(nextItem ? () => onSelect(nextItem.id) : undefined);
}
