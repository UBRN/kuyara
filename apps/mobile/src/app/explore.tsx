import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { AppText, Button, Screen } from '@/components/ui';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';

export default function ExploreScreen() {
  const messages = useMessages();

  return (
    <Screen testID="explore-screen" contentContainerStyle={styles.content}>
      <View style={styles.titleContainer}>
        <AppText
          testID="explore-title"
          accessibilityRole="header"
          variant="titleLarge"
          style={styles.centerText}>
          {messages.explore.title}
        </AppText>
        <AppText
          testID="explore-introduction"
          style={styles.centerText}
          colorRole="textSecondary">
          {messages.explore.introduction}
        </AppText>

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Button label={messages.explore.documentation} style={styles.documentationButton} />
        </ExternalLink>
      </View>

      <View style={styles.sectionsWrapper}>
        <Collapsible
          title={messages.explore.routingTitle}
          collapsedAccessibilityLabel={
            messages.explore.expandSection(messages.explore.routingTitle)
          }
          expandedAccessibilityLabel={
            messages.explore.collapseSection(messages.explore.routingTitle)
          }>
          <AppText>{messages.explore.routingBody}</AppText>
          <ExternalLink href="https://docs.expo.dev/router/introduction" asChild>
            <Button
              label={messages.explore.learnMore}
              style={styles.learnMoreButton}
              variant="quiet"
            />
          </ExternalLink>
        </Collapsible>

        <Collapsible
          title={messages.explore.platformTitle}
          collapsedAccessibilityLabel={
            messages.explore.expandSection(messages.explore.platformTitle)
          }
          expandedAccessibilityLabel={
            messages.explore.collapseSection(messages.explore.platformTitle)
          }>
          <View style={styles.collapsibleContent}>
            <AppText>{messages.explore.platformBody}</AppText>
            <Image
              source={require('@/assets/images/tutorial-web.png')}
              style={styles.imageTutorial}
            />
          </View>
        </Collapsible>

        <Collapsible
          title={messages.explore.imagesTitle}
          collapsedAccessibilityLabel={
            messages.explore.expandSection(messages.explore.imagesTitle)
          }
          expandedAccessibilityLabel={
            messages.explore.collapseSection(messages.explore.imagesTitle)
          }>
          <AppText>{messages.explore.imagesBody}</AppText>
          <Image source={require('@/assets/images/react-logo.png')} style={styles.imageReact} />
          <ExternalLink href="https://docs.expo.dev/develop/user-interface/images/" asChild>
            <Button
              label={messages.explore.learnMore}
              style={styles.learnMoreButton}
              variant="quiet"
            />
          </ExternalLink>
        </Collapsible>

        <Collapsible
          title={messages.explore.themeTitle}
          collapsedAccessibilityLabel={
            messages.explore.expandSection(messages.explore.themeTitle)
          }
          expandedAccessibilityLabel={
            messages.explore.collapseSection(messages.explore.themeTitle)
          }>
          <AppText>{messages.explore.themeBody}</AppText>
          <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/" asChild>
            <Button
              label={messages.explore.learnMore}
              style={styles.learnMoreButton}
              variant="quiet"
            />
          </ExternalLink>
        </Collapsible>

        <Collapsible
          title={messages.explore.animationsTitle}
          collapsedAccessibilityLabel={
            messages.explore.expandSection(messages.explore.animationsTitle)
          }
          expandedAccessibilityLabel={
            messages.explore.collapseSection(messages.explore.animationsTitle)
          }>
          <AppText>{messages.explore.animationsBody}</AppText>
        </Collapsible>
      </View>
      {Platform.OS === 'web' && <WebBadge />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.lg,
  },
  titleContainer: {
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.lg,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
  },
  centerText: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  documentationButton: {
    alignSelf: 'center',
  },
  sectionsWrapper: {
    gap: spacing.xl,
    paddingTop: spacing.lg,
  },
  learnMoreButton: {
    alignSelf: 'flex-start',
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
