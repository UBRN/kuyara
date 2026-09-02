import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Icon, IconButton, Screen, Surface } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { PreferenceOption } from '@/features/profile/presentation/preference-option';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type PickerOption<T extends string> = Readonly<{
  label: string;
  testID: string;
  value: T;
}>;

type PreferencePickerScreenProps<T extends string> = Readonly<{
  isSaving: boolean;
  onBack: () => void;
  onSelect: (value: T) => Promise<void>;
  options: readonly PickerOption<T>[];
  selectedValue: T;
  testID: string;
  title: string;
}>;

export function PreferencePickerScreen<T extends string>({
  isSaving,
  onBack,
  onSelect,
  options,
  selectedValue,
  testID,
  title,
}: PreferencePickerScreenProps<T>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [hasSaveError, setHasSaveError] = useState(false);

  const select = async (value: T) => {
    if (isSaving) {
      return;
    }

    setHasSaveError(false);
    try {
      await onSelect(value);
    } catch {
      setHasSaveError(true);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView
        edges={['top']}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          styles.header,
          { backgroundColor: theme.colors.surface },
          theme.elevation.chrome,
        ]}>
        <View style={styles.headerContent}>
          <IconButton
            accessibilityLabel={messages.common.back}
            hitSlop={7}
            icon={(color) => <Icon color={color} name="chevronLeft" size={20} />}
            onPress={onBack}
          />
          <AppText accessibilityRole="header" style={styles.headerTitle} variant="titleLarge">
            {title}
          </AppText>
        </View>
      </SafeAreaView>

      <Screen
        contentContainerStyle={styles.content}
        contentTopClearance={headerHeight + spacing['2xl']}
        testID={testID}>
        <Surface style={[styles.groupCard, theme.elevation.raised]}>
          <View accessibilityLabel={title} accessibilityRole="radiogroup" style={styles.options}>
            {options.map((option, index) => (
              <Fragment key={option.value}>
                {index > 0 ? <Divider variant="inset" /> : null}
                <PreferenceOption
                  disabled={isSaving}
                  label={option.label}
                  onPress={() => void select(option.value)}
                  selected={selectedValue === option.value}
                  testID={option.testID}
                />
              </Fragment>
            ))}
          </View>
        </Surface>

        {isSaving ? (
          <AppText accessibilityLiveRegion="polite" colorRole="textSecondary">
            {messages.settings.saving}
          </AppText>
        ) : null}
        {hasSaveError ? (
          <AppText
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            colorRole="textSecondary"
            testID="settings-save-error">
            {messages.settings.saveError}
          </AppText>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    width: '100%',
  },
  headerTitle: {
    flex: 1,
  },
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
  },
  groupCard: {
    padding: spacing.xl,
  },
  options: {
    gap: spacing.md,
  },
});
