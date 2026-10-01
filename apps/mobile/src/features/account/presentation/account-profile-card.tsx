import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, IconButton, Presence, Surface } from '@/components/ui';
import { useAccountScreens } from '@/features/account/application/account-screens-context';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * Frame 01: the dismissible "Complete your profile" card under Profile's title (ADR 0041
 * section 5). Continue opens the sign-in sheet on Profile; the close mark hides the card for
 * good. Once someone signs in, the card leaves in place (Presence: content, then height).
 */
export function AccountProfileCard() {
  const { port, snapshot } = useAccountScreens();
  const copy = useMessages().account.card;
  const theme = useKuyaraTheme();
  const visible = !snapshot.cardDismissed && snapshot.session.kind === 'signedOut';

  return (
    <Presence visible={visible}>
      <Surface style={styles.card} testID="account-profile-card">
        <View style={styles.head}>
          <Icon color={theme.colors.iconSecondary} name="personCircle" size={24} />
          <View style={styles.words}>
            <AppText accessibilityRole="header" variant="bodyStrong">{copy.title}</AppText>
            <AppText>{copy.body}</AppText>
          </View>
          <IconButton
            accessibilityLabel={copy.dismiss}
            icon="close"
            onPress={port.dismissCard}
            testID="account-profile-card-dismiss"
          />
        </View>
        <Button
          label={copy.action}
          onPress={() => port.openSignIn('profile')}
          style={styles.action}
          testID="account-profile-card-continue"
          variant="tonal"
        />
      </Surface>
    </Presence>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg },
  head: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  words: { flex: 1, gap: spacing.xs },
  action: { alignSelf: 'flex-start' },
});
