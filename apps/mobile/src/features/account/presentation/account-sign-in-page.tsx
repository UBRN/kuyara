import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, GlassButton, ProviderSignInButton, TextButton } from '@/components/ui';
import type { AccountIntroPageId } from '@/features/account/application/account-intro-pages';
import type { AccountProvider } from '@/features/account/application/account-screens';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { AccountIntroPager } from '@/features/account/presentation/account-intro-pager';
import { ACCOUNT_TERMS_URL } from '@/features/account/domain/account-terms';
import { StatusLine, type StatusLineTone } from '@/features/account/presentation/account-status';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

const providers: readonly AccountProvider[] = ['apple', 'google'];

function open(url: string) {
  void Linking.openURL(url).catch(() => {
    // A link the system cannot open leaves the screen as it was; nothing is lost.
  });
}

/**
 * Frames 02, 17, 18, 19 and 33: the sign-in page. The benefit pages first, swiped sideways,
 * then, still while they move, the Apple and Google buttons, equal in size, at thumb reach,
 * a centred "Not now" and the footnote with the Account terms and the privacy policy. Close stays live while a
 * sign-in runs and cancels it. At large text sizes the whole page scrolls.
 */
export function AccountSignInPage({ initialPage }: Readonly<{ initialPage?: AccountIntroPageId }>) {
  const { port, snapshot } = useAccountScreens();
  const { language, messages } = useLocalization();
  const copy = messages.account.signIn;
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
      <View style={[styles.inset, styles.head]}>
        <GlassButton kind="close" label={copy.close} onPress={port.closeSheet} testID="account-sign-in-close" />
        <AppText accessibilityRole="header" variant="titleLarge">{copy.title}</AppText>
      </View>
      <AccountIntroPager initialPage={initialPage} />
      <View style={styles.spacer} />
      <View style={[styles.inset, styles.foot]}>
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
        <View>
          <AppText colorRole="textSecondary" variant="caption">{copy.footer}</AppText>
          <View style={styles.links}>
            <TextButton link label={copy.terms} onPress={() => open(ACCOUNT_TERMS_URL[language])} testID="account-sign-in-terms" />
            <TextButton link label={copy.privacy} onPress={() => open(PRIVACY_POLICY_URL[language])} testID="account-sign-in-privacy" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.md, paddingVertical: spacing.lg },
  inset: { paddingHorizontal: spacing.lg },
  head: { alignItems: 'flex-start', gap: spacing.md },
  spacer: { flex: 1 },
  foot: { gap: spacing.md },
  buttons: { gap: spacing.md },
  notNow: { alignSelf: 'center' },
  // Each link answers a full touch target; its words line up with the footnote's.
  links: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -spacing.sm },
});
