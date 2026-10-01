import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, GlassButton, Icon, ProviderSignInButton, type IconName } from '@/components/ui';
import type { AccountProvider } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { StatusLine, type StatusLineTone } from '@/features/account/presentation/account-status';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const benefitGlyphs: readonly IconName[] = ['sync', 'reinstall', 'statusRunning'];
const providers: readonly AccountProvider[] = ['apple', 'google'];

/**
 * Frames 02, 17, 18, 19 and 33: the sign-in page. The benefits first, then the Apple and
 * Google buttons, equal in size, at thumb reach, a centred "Not now" and the footnote with
 * the privacy policy. Close stays live while a sign-in runs and cancels it.
 */
export function AccountSignInPage() {
  const { port, snapshot } = useAccountScreens();
  const copy = useMessages().account.signIn;
  const theme = useKuyaraTheme();
  const { signIn } = snapshot;
  const pending = signIn.kind === 'pending' ? signIn.provider : null;
  const status: Readonly<{ tone: StatusLineTone; text: string }> | null = signIn.kind === 'cancelled'
    ? { tone: 'neutral', text: copy.cancelled }
    : signIn.kind === 'failed'
      ? { tone: 'danger', text: copy.failed[signIn.provider] }
      : !snapshot.online
        ? { tone: 'warning', text: copy.offline }
        : null;

  return (
    <ScrollView contentContainerStyle={styles.content} testID="account-sign-in-page">
      <View style={styles.head}>
        <GlassButton kind="close" label={copy.close} onPress={port.closeSheet} testID="account-sign-in-close" />
      </View>
      <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
      <View style={styles.benefits}>
        {copy.benefits.map((benefit, index) => (
          <View key={benefit} style={styles.benefit}>
            <Icon color={theme.colors.iconSecondary} name={benefitGlyphs[index]} size={20} />
            <AppText style={styles.benefitText}>{benefit}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.spacer} />
      {status ? <StatusLine testID="account-sign-in-status" text={status.text} tone={status.tone} /> : null}
      <View style={styles.buttons}>
        {providers.map((provider) => (
          <ProviderSignInButton
            disabled={pending !== null && pending !== provider}
            key={provider}
            label={copy.continueWith[provider]}
            loading={pending === provider}
            onPress={() => port.signIn(provider)}
            provider={provider}
            testID={`account-sign-in-${provider}`}
          />
        ))}
      </View>
      <Button
        disabled={pending !== null}
        label={copy.notNow}
        onPress={port.closeSheet}
        style={styles.notNow}
        testID="account-sign-in-not-now"
        variant="plain"
      />
      <AppText colorRole="textSecondary" variant="caption">
        {copy.footer}{' '}
        <AppText
          accessibilityRole="link"
          colorRole="brandPrimary"
          onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}
          testID="account-sign-in-privacy"
          variant="caption">
          {copy.privacy}
        </AppText>
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start' },
  benefits: { gap: spacing.md },
  benefit: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  benefitText: { flex: 1 },
  spacer: { flex: 1, minHeight: spacing.xl },
  buttons: { gap: spacing.md },
  notNow: { alignSelf: 'center' },
});
