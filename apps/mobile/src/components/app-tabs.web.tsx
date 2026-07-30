import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';

import { AppText, Surface } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export default function AppTabs() {
  const messages = useMessages();

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>{messages.tabs.home}</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>{messages.tabs.explore}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <Surface
        variant={isFocused ? 'interactive' : 'muted'}
        style={styles.tabButtonView}>
        <AppText variant="label" colorRole={isFocused ? 'textPrimary' : 'textSecondary'}>
          {children}
        </AppText>
      </Surface>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();

  return (
    <View {...props} style={styles.tabListContainer}>
      <Surface variant="elevated" style={styles.innerContainer}>
        <AppText variant="bodyStrong" style={styles.brandText}>
          {messages.web.starter}
        </AppText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <AppText variant="label">{messages.web.docs}</AppText>
            <SymbolView
              tintColor={theme.colors.iconPrimary}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: spacing.sm,
    maxWidth: layout.maxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  tabButtonView: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.md,
  },
});
