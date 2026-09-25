import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Icon,
  iconNames,
  NativeList,
  NativeListSection,
  NativeListRow,
  NativePickerRow,
  NativeSheet,
  Button,
} from '@/components/ui';
import type { LanguagePreference, ThemePreference } from '@/domain/preferences';
import type { DressStyle, Gender, LocalProfile, StyleAesthetic } from '@/features/profile/domain/profile';
import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { aestheticLabels, StyleAestheticsOptions } from '@/features/profile/presentation/style-aesthetics-options';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

export type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  notificationsOn: boolean;
  isSaving: boolean;
  onLanguageChange: (value: LanguagePreference) => Promise<void>;
  onAppearanceChange: (value: ThemePreference) => Promise<void>;
  onOpenNotifications: () => void;
  onOpenServiceProviders: () => void;
  onGenderChange: (value: Gender) => Promise<void>;
  onDressStyleChange: (value: DressStyle) => Promise<void>;
  onStyleAestheticsChange: (values: readonly StyleAesthetic[]) => Promise<void>;
  onMorningSheetEnabledChange: (enabled: boolean) => Promise<void>;
  onOpenBirthDate: () => void;
  onNameChange: (value: string | null) => Promise<void>;
  onOpenPrivacy: () => void;
  onOpenSupport: () => void;
  onShare: () => void;
  onRate: () => void;
  onOpenLicence: () => void;
  showRate: boolean;
}>;

export function SettingsScreen({
  isSaving,
  notificationsOn,
  onAppearanceChange,
  onDressStyleChange,
  onStyleAestheticsChange,
  onMorningSheetEnabledChange,
  onGenderChange,
  onLanguageChange,
  onOpenServiceProviders,
  onOpenBirthDate,
  onNameChange,
  onOpenNotifications,
  onOpenPrivacy,
  onOpenSupport,
  onShare,
  onRate,
  onOpenLicence,
  showRate,
  profile,
}: SettingsScreenProps) {
  const { language, messages } = useLocalization();
  const { width } = useWindowDimensions();
  const copy = messages.preferences;
  const [saveErrorGroup, setSaveErrorGroup] = useState<'appearance' | 'profile' | null>(null);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [aestheticsOpen, setAestheticsOpen] = useState(false);
  const [aestheticDraft, setAestheticDraft] = useState<readonly StyleAesthetic[]>(profile.styleAesthetics ?? []);

  const savePreference = async (
    group: 'appearance' | 'profile',
    save: () => Promise<void>,
  ) => {
    setSaveErrorGroup(null);
    try {
      await save();
    } catch {
      setSaveErrorGroup(group);
    }
  };

  const birthDateValue = profile.birthDate === null
    ? messages.onboarding.birthDateNotSet
    : new Intl.DateTimeFormat(language, { dateStyle: 'long' })
      .format(calendarDate(profile.birthDate));
  const notificationValue = notificationsOn
    ? messages.notifications.statusOn
    : messages.notifications.statusOff;
  const version = Constants.expoConfig?.version;
  const build = Constants.platform?.ios?.buildNumber
    ?? Constants.platform?.android?.versionCode?.toString();

  return (
    <>
    <NativeList testID="settings-screen">
      <NativeListSection
        footer={saveErrorGroup === 'appearance' ? messages.settings.saveError : undefined}
        heading={messages.settings.appearanceHeading}
        testID="settings-appearance-group">
        <NativePickerRow
          disabled={isSaving}
          label={copy.languageTitle}
          onSelectionChange={(value) => savePreference(
            'appearance',
            () => onLanguageChange(value),
          )}
          options={[
            { label: copy.languageSystem, value: 'system' },
            { label: copy.languageTurkish, value: 'tr' },
            { label: copy.languageEnglish, value: 'en' },
          ]}
          selection={profile.languagePreference}
          systemImage={iconNames.language.ios}
          testID="settings-language-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={messages.settings.themeRow}
          onSelectionChange={(value) => savePreference(
            'appearance',
            () => onAppearanceChange(value),
          )}
          options={[
            { label: copy.themeSystem, value: 'system' },
            { label: copy.themeLight, value: 'light' },
            { label: copy.themeDark, value: 'dark' },
          ]}
          selection={profile.themePreference}
          systemImage={iconNames.theme.ios}
          testID="settings-theme-row"
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.notificationsHeading}
        testID="settings-notifications-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="bell" size={size} />}
          label={messages.notifications.title}
          onPress={onOpenNotifications}
          testID="settings-notifications-row"
          value={notificationValue}
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.profileHeading}
        footer={saveErrorGroup === 'profile' ? messages.settings.saveError : undefined}
        testID="settings-profile-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="tabProfileOutline" size={size} />}
          label={messages.profile.nameLabel}
          onPress={() => setNameEditorOpen(true)}
          testID="settings-name-row"
          value={profile.displayName ?? undefined}
        />
        <NativePickerRow
          disabled={isSaving}
          label={copy.genderTitle}
          onSelectionChange={(value) => savePreference(
            'profile',
            () => onGenderChange(value),
          )}
          options={[
            { label: copy.genderWoman, value: 'woman' },
            { label: copy.genderMan, value: 'man' },
          ]}
          selection={profile.gender ?? 'woman'}
          systemImage={iconNames.tabProfileOutline.ios}
          testID="settings-gender-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={copy.dressStyleTitle}
          onSelectionChange={(value) => savePreference(
            'profile',
            () => onDressStyleChange(value),
          )}
          options={[
            { label: copy.dressStyleCasual, value: 'casual' },
            { label: copy.dressStyleSmart, value: 'smart' },
            { label: copy.dressStyleFormal, value: 'formal' },
          ]}
          selection={profile.dressStyle ?? 'smart'}
          systemImage={iconNames.clothing.ios}
          testID="settings-dress-style-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
          label={copy.stylePreferencesTitle}
          onPress={() => { setAestheticDraft(profile.styleAesthetics ?? []); setAestheticsOpen(true); }}
          testID="settings-style-preferences-row"
          value={aestheticLabels(copy, profile.styleAesthetics ?? [])}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
          label={copy.morningQuestionTitle}
          testID="settings-morning-question-row"
          toggle={{ value: profile.morningSheetEnabled ?? true, disabled: isSaving,
            onValueChange: (enabled) => { void savePreference('profile', () => onMorningSheetEnabledChange(enabled)); } }}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
          label={copy.birthDateTitle}
          onPress={onOpenBirthDate}
          testID="settings-birth-date-row"
          value={birthDateValue}
        />
      </NativeListSection>
      <NativeListSection heading={messages.settings.helpHeading} testID="settings-help-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="help" size={size} />}
          label={messages.settings.supportRow}
          onPress={onOpenSupport}
          testID="settings-support-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="share" size={size} />}
          label={messages.settings.shareRow}
          onPress={onShare}
          testID="settings-share-row"
        />
        {showRate ? (
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="star" size={size} />}
            label={messages.settings.rateRow}
            onPress={onRate}
            ratingStars
            testID="settings-rate-row"
          />
        ) : null}
      </NativeListSection>
      <NativeListSection heading={messages.settings.aboutHeading} testID="settings-about-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="sparkle" size={size} />}
          label={messages.settings.serviceProvidersHeading}
          onPress={onOpenServiceProviders}
          testID="settings-service-providers-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="info" size={size} />}
          label={messages.analytics.privacyTitle}
          onPress={onOpenPrivacy}
          testID="settings-privacy-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="document" size={size} />}
          label={messages.settings.licenceRow}
          onPress={onOpenLicence}
          testID="settings-licence-row"
        />
      </NativeListSection>
      <NativeListSection footer={
        <View style={[styles.footer, { width: Math.max(0, width - spacing.lg * 4) }]}>
          <AppText colorRole="brandPrimary" fitSingleLine style={styles.name} testID="settings-brand-name" variant="display">
            kuyara
          </AppText>
          <AppText colorRole="textSecondary" style={styles.version} tabularNumbers testID="settings-version" variant="caption">
            {version ? messages.settings.versionLine(version, build) : messages.settings.developmentBuild}
          </AppText>
        </View>
      } />
    </NativeList>
    <NameSheet
      initialName={profile.displayName}
      mode="edit"
      onDismiss={() => setNameEditorOpen(false)}
      onSave={async (name) => {
        await onNameChange(name);
        setNameEditorOpen(false);
      }}
      visible={nameEditorOpen}
    />
    <NativeSheet visible={aestheticsOpen} onDismiss={() => setAestheticsOpen(false)} testID="settings-style-preferences-sheet">
      <ScrollView contentContainerStyle={styles.sheetContent}>
        <AppText accessibilityRole="header" variant="titleLarge">{copy.stylePreferencesTitle}</AppText>
        <AppText>{copy.stylePreferencesBody}</AppText>
        <StyleAestheticsOptions copy={copy} selected={aestheticDraft}
          onChange={setAestheticDraft} testID="settings-style-option" />
        <Button label={copy.stylePreferencesDone} onPress={() => {
          void savePreference('profile', () => onStyleAestheticsChange(aestheticDraft));
          setAestheticsOpen(false);
        }} size="large" testID="settings-style-done" />
      </ScrollView>
    </NativeSheet>
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingBottom: spacing['2xl'],
  },
  name: { textAlign: 'center' },
  version: { textAlign: 'center' },
  sheetContent: { gap: spacing.md, padding: spacing.lg },
});

function calendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
