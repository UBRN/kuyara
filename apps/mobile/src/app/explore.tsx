import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';
import { platformLayout } from '@/theme/platform';

export default function ExploreScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + platformLayout.bottomTabInset + spacing.lg,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: spacing['2xl'],
      paddingBottom: spacing.xl,
    },
  });

  return (
    <ScrollView
      testID="explore-screen"
      style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText testID="explore-title" accessibilityRole="header" variant="titleLarge">
            {messages.explore.title}
          </ThemedText>
          <ThemedText
            testID="explore-introduction"
            style={styles.centerText}
            themeColor="textSecondary">
            {messages.explore.introduction}
          </ThemedText>

          <ExternalLink href="https://docs.expo.dev" asChild>
            <Pressable
              style={({ pressed }) => [styles.linkPressable, pressed && styles.pressed]}>
              <ThemedView backgroundRole="surfaceInteractive" style={styles.linkButton}>
                <ThemedText variant="label" style={styles.linkLabel}>
                  {messages.explore.documentation}
                </ThemedText>
                <SymbolView
                  tintColor={theme.colors.iconPrimary}
                  name={{ ios: 'arrow.up.right.square', android: 'link', web: 'link' }}
                  size={12}
                />
              </ThemedView>
            </Pressable>
          </ExternalLink>
        </ThemedView>

        <ThemedView style={styles.sectionsWrapper}>
          <Collapsible title={messages.explore.routingTitle}>
            <ThemedText>{messages.explore.routingBody}</ThemedText>
            <ExternalLink href="https://docs.expo.dev/router/introduction">
              <ThemedText variant="label" themeColor="brandAccent">
                {messages.explore.learnMore}
              </ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={messages.explore.platformTitle}>
            <ThemedView backgroundRole="surfaceMuted" style={styles.collapsibleContent}>
              <ThemedText>{messages.explore.platformBody}</ThemedText>
              <Image
                source={require('@/assets/images/tutorial-web.png')}
                style={styles.imageTutorial}
              />
            </ThemedView>
          </Collapsible>

          <Collapsible title={messages.explore.imagesTitle}>
            <ThemedText>{messages.explore.imagesBody}</ThemedText>
            <Image source={require('@/assets/images/react-logo.png')} style={styles.imageReact} />
            <ExternalLink href="https://docs.expo.dev/develop/user-interface/images/">
              <ThemedText variant="label" themeColor="brandAccent">
                {messages.explore.learnMore}
              </ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={messages.explore.themeTitle}>
            <ThemedText>{messages.explore.themeBody}</ThemedText>
            <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
              <ThemedText variant="label" themeColor="brandAccent">
                {messages.explore.learnMore}
              </ThemedText>
            </ExternalLink>
          </Collapsible>

          <Collapsible title={messages.explore.animationsTitle}>
            <ThemedText>{messages.explore.animationsBody}</ThemedText>
          </Collapsible>
        </ThemedView>
        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: layout.maxContentWidth,
    flexGrow: 1,
    width: '100%',
  },
  titleContainer: {
    alignSelf: 'stretch',
    gap: spacing.lg,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  linkPressable: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  linkButton: {
    flexShrink: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    justifyContent: 'center',
    gap: spacing.xs,
    alignItems: 'center',
  },
  linkLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  sectionsWrapper: {
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  collapsibleContent: {
    alignItems: 'center',
  },
  imageTutorial: {
    width: '100%',
    aspectRatio: 296 / 171,
    borderRadius: radii.control,
    marginTop: spacing.sm,
  },
  imageReact: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
});
