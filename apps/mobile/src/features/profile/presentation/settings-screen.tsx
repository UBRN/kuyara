import { dressStyles } from '@kuyara/contracts';
import Constants from 'expo-constants';
import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AiSparkleMark } from '@/components/ui/ai-sparkle-mark';
import { FEEDBACK_FORM_ENABLED } from '@/features/feedback/application/feedback-form-flag';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import {
  AppText,
  Icon,
  NativeList,
  NativeListSection,
  NativeListRow,
  NativePickerRow,
  NativeSheet,
  Button,
} from '@/components/ui';
import { parseCalendarDate } from '@/domain/calendar-date';
import type { LanguagePreference, ThemePreference } from '@/domain/preferences';
import {
  defaultDressStyle,
  genderSchema,
  type DressStyle,
  type Gender,
  type LocalProfile,
  type StyleAesthetic,
} from '@/features/profile/domain/profile';
import { NameSheet } from '@/features/profile/presentation/name-sheet';
import { aestheticLabels, StyleAestheticsOptions } from '@/features/profile/presentation/style-aesthetics-options';
import { useLocalization } from '@/localization/use-messages';
import { localeTag } from '@/localization/locale-tag';
import { spacing } from '@/theme/theme';

export type SettingsScreenProps = Readonly<{
  profile: LocalProfile;
  notificationsOn: boolean;
  isSaving: boolean;
  onLanguageChange: (value: LanguagePreference) => Promise<void>;
  onAppearanceChange: (value: ThemePreference) => Promise<void>;
  onOpenNotifications: () => void;
  onOpenEasierToSee: () => void;
  onOpenServiceProviders: () => void;
  onGenderChange: (value: Gender) => Promise<void>;
  onDressStyleChange: (value: DressStyle) => Promise<void>;
  onStyleAestheticsChange: (values: readonly StyleAesthetic[]) => Promise<void>;
  onMorningSheetEnabledChange: (enabled: boolean) => Promise<void>;
  onOpenBirthDate: () => void;
  onNameChange: (value: string | null) => Promise<void>;
  onOpenPrivacy: () => void;
  onOpenSupport: () => void;
  onOpenFeedback?: () => void;
  onShare: () => void;
  onRate: () => void;
  onOpenLicence: () => void;
  /** Phase 8: the coach-mark tour again, from step 1 over Today; the gate is not touched. */
  onRestartTour?: () => void;
  showRate: boolean;
  /** The Account group's place, directly above Profile (ADR 0041 section 5); the route decides whether it shows. */
  accountSection?: ReactNode;
}>;

export function SettingsScreen({
  accountSection = null,
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
  onOpenEasierToSee,
  onOpenPrivacy,
  onOpenSupport,
  onOpenFeedback,
  onShare,
  onRate,
  onOpenLicence,
  onRestartTour,
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
  const [aestheticsSaving, setAestheticsSaving] = useState(false);
  const [aestheticsError, setAestheticsError] = useState(false);
  // O11: the Service providers row's mark plays its appear once, when the row first comes
  // on screen; the row sits below the fold, so it waits for the row rather than the mount.
  const [serviceRowSeen, setServiceRowSeen] = useState(false);
  const aestheticsSavePending = useRef(false);
  // The footer under the group changes silently for VoiceOver, so its failure is spoken.
  useErrorAnnouncement(saveErrorGroup ? messages.settings.saveError : null);

  // The sheet closes only once the choice is stored. A failed save keeps it open with the
  // draft intact, so nothing the person picked is lost and Done can simply be pressed again.
  const saveAesthetics = async () => {
    if (aestheticsSavePending.current) return;
    aestheticsSavePending.current = true;
    setAestheticsSaving(true);
    setAestheticsError(false);
    // A promise chain, not try/finally: React Compiler does not compile a component holding a
    // `finally` clause, and Settings then re-rendered every row on each change.
    await (async () => {
      await onStyleAestheticsChange(aestheticDraft);
      setAestheticsOpen(false);
    })()
      .catch(() => {
        setAestheticsError(true);
        AccessibilityInfo.announceForAccessibility(messages.settings.saveError);
      })
      .finally(() => {
        aestheticsSavePending.current = false;
        setAestheticsSaving(false);
      });
  };

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
    : new Intl.DateTimeFormat(localeTag(language), { dateStyle: 'long' })
      .format(parseCalendarDate(profile.birthDate));
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
          icon="language"
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
          icon="theme"
          testID="settings-theme-row"
        />
      </NativeListSection>

      {/* O13: Accessibility sits directly under Appearance. */}
      <NativeListSection
        heading={messages.settings.accessibilityHeading}
        testID="settings-accessibility-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="accessibility" size={size} />}
          label={messages.settings.easierToSee.title}
          onPress={onOpenEasierToSee}
          testID="settings-easier-to-see-row"
          value={profile.easierToSee === true
            ? messages.settings.easierToSee.on
            : messages.settings.easierToSee.off}
        />
      </NativeListSection>

      <NativeListSection
        heading={messages.settings.notificationsHeading}
        testID="settings-notifications-group">
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="bellOutline" size={size} />}
          label={messages.notifications.title}
          onPress={onOpenNotifications}
          testID="settings-notifications-row"
          value={notificationValue}
        />
      </NativeListSection>

      {accountSection}
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
          options={genderSchema.options.map((value) => ({
            label: { woman: copy.genderWoman, man: copy.genderMan }[value],
            value,
          }))}
          selection={profile.gender ?? 'woman'}
          icon="tabProfileOutline"
          testID="settings-gender-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={copy.dressStyleTitle}
          onSelectionChange={(value) => savePreference(
            'profile',
            () => onDressStyleChange(value),
          )}
          options={dressStyles.map((value) => ({
            label: {
              casual: copy.dressStyleCasual,
              smart: copy.dressStyleSmart,
              formal: copy.dressStyleFormal,
            }[value],
            value,
          }))}
          selection={profile.dressStyle ?? defaultDressStyle}
          icon="clothing"
          testID="settings-dress-style-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="clothing" size={size} />}
          label={copy.stylePreferencesTitle}
          onPress={() => {
            setAestheticDraft(profile.styleAesthetics ?? []);
            setAestheticsError(false);
            setAestheticsOpen(true);
          }}
          testID="settings-style-preferences-row"
          value={aestheticLabels(copy, profile.styleAesthetics ?? [])}
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="sunrise" size={size} />}
          label={copy.dayQuestionsTitle}
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
        {FEEDBACK_FORM_ENABLED && onOpenFeedback ? (
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="document" size={size} />}
            label={messages.settings.feedback.title}
            onPress={onOpenFeedback}
            testID="settings-feedback-row"
          />
        ) : null}
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="helpOutline" size={size} />}
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
            glyph={({ color, size }) => <Icon color={color} name="starOutline" size={size} />}
            label={messages.settings.rateRow}
            onPress={onRate}
            ratingStars
            testID="settings-rate-row"
          />
        ) : null}
        {onRestartTour ? (
          <NativeListRow
            glyph={({ color, size }) => <Icon color={color} name="handTap" size={size} />}
            label={messages.walkthrough.name}
            onPress={onRestartTour}
            testID="settings-walkthrough-row"
          />
        ) : null}
      </NativeListSection>
      <NativeListSection heading={messages.settings.aboutHeading} testID="settings-about-group">
        <NativeListRow
          glyph={({ color, size }) => (
            <AiSparkleMark color={color} play={serviceRowSeen} repeats={false} size={size} />
          )}
          label={messages.settings.serviceProvidersHeading}
          onAppear={() => setServiceRowSeen(true)}
          onPress={onOpenServiceProviders}
          testID="settings-service-providers-row"
        />
        <NativeListRow
          glyph={({ color, size }) => <Icon color={color} name="infoOutline" size={size} />}
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
        <StyleAestheticsOptions copy={copy} disabled={aestheticsSaving} selected={aestheticDraft}
          onChange={setAestheticDraft} testID="settings-style-option" />
        {aestheticsError ? (
          <AppText accessibilityRole="alert" colorRole="textSecondary" testID="settings-style-save-error">
            {messages.settings.saveError}
          </AppText>
        ) : null}
        <Button label={copy.stylePreferencesDone} loading={aestheticsSaving}
          onPress={() => { void saveAesthetics(); }} size="large" testID="settings-style-done" />
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
