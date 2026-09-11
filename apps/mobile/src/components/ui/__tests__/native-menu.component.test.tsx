import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { NativeMenu } from '@/components/ui/native-menu';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const {
    Pressable,
    Text,
    View,
  } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    Host: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
      <View testID="native-menu-host" {...props}>{children}</View>
    ),
    RNHostView: ({ children }: PropsWithChildren) => <View>{children}</View>,
    Menu: ({ children, label, modifiers }: PropsWithChildren<{
      label: React.ReactNode;
      modifiers?: readonly unknown[];
    }>) => {
      const [open, setOpen] = React.useState(false);
      return (
        <View {...{ modifiers }}>
          <Pressable onPress={() => setOpen(true)}>{label}</Pressable>
          {open ? children : null}
        </View>
      );
    },
    Button: ({ label, onPress, systemImage }: Readonly<{
      label: string;
      onPress?: () => void;
      systemImage?: string;
    }>) => (
      <Pressable accessibilityRole="button" onPress={onPress} {...{ systemImage }}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  tint: (color: string) => ({ $type: 'tint', color }),
}));

function TestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

test('opens from one labelled button and selects only a different item', async () => {
  const onSelect = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeMenu
        accessibilityHint="Changes ownership"
        accessibilityLabel="Jumpsuit, One-piece, Owned"
        height={42}
        hitSlop={8}
        items={[
          { id: 'owned', label: 'I own it', selected: true },
          { id: 'wanted', label: 'I want it' },
        ]}
        onSelect={onSelect}
        testID="ownership-menu"
        width={120}>
        <></>
      </NativeMenu>
    </TestProviders>,
  );

  const trigger = result.getByRole('button', { name: 'Jumpsuit, One-piece, Owned' });
  expect(trigger).toHaveProp('accessibilityHint', 'Changes ownership');
  expect(trigger.props.accessibilityState.selected).toBeUndefined();
  expect(trigger).toHaveProp('hitSlop', 8);
  expect(result.getByTestId('native-menu-host')).toHaveStyle({ height: 42, width: 120 });

  await fireEvent.press(trigger);
  const ownedItem = result.getByRole('button', { name: 'I own it' });
  const wantedItem = result.getByRole('button', { name: 'I want it' });
  expect(ownedItem.props.systemImage).toBe('checkmark');
  expect(wantedItem.props.systemImage).toBeUndefined();

  await fireEvent.press(ownedItem);
  expect(onSelect).not.toHaveBeenCalled();
  await fireEvent.press(wantedItem);
  expect(onSelect).toHaveBeenCalledWith('wanted');
});
