import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, IconButton, Screen, Surface } from '@/components/ui';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type ProfileScreenProps = Readonly<{
  onOpenSettings: () => void;
  onOpenWardrobe: () => void;
}>;

export function ProfileScreen({
  onOpenSettings,
  onOpenWardrobe,
}: ProfileScreenProps) {
  const messages = useMessages();
  const copy = messages.profile;
  const theme = useKuyaraTheme();
  const { state } = useWardrobeApplication();
  const counts = state.status === 'ready'
    ? {
        owned: state.items.filter(({ entryState }) => entryState === 'owned').length,
        wanted: state.items.filter(({ entryState }) => entryState === 'wanted').length,
      }
    : null;

  return (
    <Screen contentContainerStyle={styles.content} testID="profile-screen">
      <View style={styles.header}>
        <AppText accessibilityRole="header" style={styles.title} variant="titleLarge">
          {copy.title}
        </AppText>
        <IconButton
          accessibilityHint={copy.settingsHint}
          accessibilityLabel={copy.settingsAction}
          icon={(color) => (
            <SymbolView
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              size={18}
              tintColor={color}
            />
          )}
          onPress={onOpenSettings}
          testID="profile-settings-button"
        />
      </View>

      <Pressable
        accessibilityHint={copy.wardrobeHint}
        accessibilityLabel={
          counts
            ? copy.wardrobeSummary(counts)
            : copy.wardrobeTitle
        }
        accessibilityRole="button"
        onPress={onOpenWardrobe}
        testID="profile-wardrobe-button">
        {({ pressed }) => (
          <Surface
            style={[styles.wardrobeCard, pressed && styles.pressed]}
            variant="elevated">
            <View style={styles.cardHeader}>
              <AppText variant="title">{copy.wardrobeTitle}</AppText>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  size={20}
                  tintColor={theme.colors.iconSecondary}
                />
              </View>
            </View>

            {counts ? (
              <>
                <View style={styles.counts}>
                  <View style={styles.count}>
                    <AppText testID="profile-owned-count" variant="display">
                      {counts.owned}
                    </AppText>
                    <AppText colorRole="textSecondary">{copy.ownedLabel}</AppText>
                  </View>
                  <View style={styles.count}>
                    <AppText testID="profile-wanted-count" variant="title">
                      {counts.wanted}
                    </AppText>
                    <AppText colorRole="textSecondary">{copy.wantedLabel}</AppText>
                  </View>
                </View>
                {counts.owned + counts.wanted === 0 ? (
                  <AppText colorRole="textSecondary">{copy.wardrobeEmpty}</AppText>
                ) : null}
              </>
            ) : (
              <AppText colorRole="textSecondary">
                {state.status === 'loading'
                  ? copy.wardrobeLoading
                  : copy.wardrobeUnavailable}
              </AppText>
            )}
          </Surface>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  title: {
    flex: 1,
  },
  wardrobeCard: {
    gap: spacing.xl,
    minHeight: layout.minimumTouchTarget,
    padding: spacing.xl,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  counts: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing['2xl'],
  },
  count: {
    gap: spacing.xs,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
