import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  AppText,
  GarmentSlotTile,
  Icon,
  IconButton,
  Screen,
  Surface,
} from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const profileCategories = [
  'top',
  'bottom',
  'outerwear',
  'footwear',
] as const satisfies readonly StructuralCategory[];

type ProfileScreenProps = Readonly<{
  activePlaceName: string | null;
  onOpenSettings: () => void;
  onOpenWardrobe: () => void;
  onOpenWeather: () => void;
}>;

export function ProfileScreen({
  activePlaceName,
  onOpenSettings,
  onOpenWardrobe,
  onOpenWeather,
}: ProfileScreenProps) {
  const { fontScale } = useWindowDimensions();
  const messages = useMessages();
  const copy = messages.profile;
  const theme = useKuyaraTheme();
  const { state } = useWardrobeApplication();
  const items = state.status === 'ready' ? state.items : null;
  const counts = items
    ? {
        owned: items.filter(({ entryState }) => entryState === 'owned').length,
        wanted: items.filter(({ entryState }) => entryState === 'wanted').length,
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
          icon={(color) => <Icon color={color} name="settings" size={18} />}
          onPress={onOpenSettings}
          style={[
            styles.settingsButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
          testID="profile-settings-button"
        />
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="title">
          {copy.wardrobeTitle}
        </AppText>
        <Surface
          style={theme.elevation.raised}
          testID="profile-wardrobe-card">
          {counts && items ? (
            <>
              <Pressable
                accessibilityHint={copy.wardrobeHint}
                accessibilityLabel={copy.wardrobeSummary(counts)}
                accessibilityRole="button"
                onPress={onOpenWardrobe}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID="profile-wardrobe-button">
                <View style={styles.ownedCopy}>
                  <View style={styles.numberLine}>
                    <AppText testID="profile-owned-count" variant="display">
                      {counts.owned}
                    </AppText>
                    <AppText colorRole="textSecondary">
                      {copy.piecesSavedUnit({ count: counts.owned })}
                    </AppText>
                  </View>
                  {counts.owned + counts.wanted === 0 ? (
                    <AppText colorRole="textSecondary">{copy.wardrobeEmpty}</AppText>
                  ) : null}
                </View>
                <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
              </Pressable>

              <Divider />

              <Pressable
                accessibilityHint={copy.wardrobeHint}
                accessibilityLabel={copy.categoryCountAccessibilityLabel({
                  category: copy.wantedLabel,
                  count: counts.wanted,
                })}
                accessibilityRole="button"
                onPress={onOpenWardrobe}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID="profile-wanted-button">
                <Icon color={theme.colors.iconPrimary} name="heart" size={21} />
                <AppText style={styles.rowLabel}>{copy.wantedLabel}</AppText>
                <AppText testID="profile-wanted-count" variant="bodyStrong">
                  {counts.wanted}
                </AppText>
                <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
              </Pressable>

              <Divider />

              <View style={styles.categories}>
                {profileCategories.map((category) => {
                  const count = items.filter((item) => item.category === category).length;
                  const categoryLabel =
                    messages.catalog[`catalog.attribute.structural_category.${category}`];

                  return (
                    <View
                      accessibilityLabel={copy.categoryCountAccessibilityLabel({
                        category: categoryLabel,
                        count,
                      })}
                      accessible
                      key={category}
                      style={[
                        styles.category,
                        fontScale > 1.5 && styles.largeTextCategory,
                      ]}
                      testID={`profile-category-${category}`}>
                      <GarmentSlotTile
                        category={category}
                        color={theme.colors.iconPrimary}
                        size={28}
                      />
                      <AppText colorRole="textSecondary" variant="caption">
                        {categoryLabel}
                      </AppText>
                      <AppText
                        colorRole="textSecondary"
                        testID={`profile-category-${category}-count`}
                        variant="caption">
                        {count}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.stateRow}>
              <AppText colorRole="textSecondary">
                {state.status === 'loading'
                  ? copy.wardrobeLoading
                  : copy.wardrobeUnavailable}
              </AppText>
            </View>
          )}
        </Surface>
      </View>

      <View style={styles.section}>
        <AppText accessibilityRole="header" variant="title">
          {copy.locationTitle}
        </AppText>
        <Surface style={theme.elevation.raised} testID="profile-location-card">
          <Pressable
            accessibilityHint={copy.locationChangeHint}
            accessibilityLabel={
              activePlaceName
                ? [activePlaceName, messages.weather.approximateLocation].join(', ')
                : copy.locationUnset
            }
            accessibilityRole="button"
            onPress={onOpenWeather}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID="profile-location-button">
            <Icon color={theme.colors.iconPrimary} name="location" size={21} />
            <View style={styles.locationCopy}>
              <AppText variant="bodyStrong">
                {activePlaceName ?? copy.locationUnset}
              </AppText>
              {activePlaceName ? (
                <AppText colorRole="textSecondary" variant="caption">
                  {messages.weather.approximateLocation}
                </AppText>
              ) : null}
            </View>
            <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
          </Pressable>

          <Divider />

          <View style={styles.row} testID="profile-location-status">
            <Icon
              color={theme.colors.iconPrimary}
              name={activePlaceName ? 'checkCircle' : 'location'}
              size={21}
            />
            <AppText style={styles.rowLabel}>
              {activePlaceName
                ? copy.recommendationsWorking
                : copy.recommendationsNeedLocation}
            </AppText>
          </View>
        </Surface>
      </View>
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
  settingsButton: {
    borderWidth: borderWidths.subtle,
  },
  section: {
    gap: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ownedCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  numberLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowLabel: {
    flex: 1,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: spacing.sm,
  },
  category: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    width: '25%',
  },
  largeTextCategory: {
    width: '50%',
  },
  stateRow: {
    minHeight: layout.minimumTouchTarget,
    padding: spacing.lg,
  },
  locationCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
