import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { AppText, IconButton } from '@/components/ui';
import {
  ACCOUNT_INTRO_PAGE_DWELL_MS,
  accountIntroPageIds,
  type AccountIntroPageId,
} from '@/features/account/application/account-intro-pages';
import { accountIntroScenes } from '@/features/account/presentation/account-intro-scenes';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const SCENE_HEIGHT = 188;
const lastPage = accountIntroPageIds.length - 1;

function useScreenReaderRunning() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (mounted) setRunning(enabled); });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setRunning);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return running;
}

function useAppInForeground() {
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  return foreground;
}

/**
 * The sign-in page's benefits (ADR 0041 section 5): one page per benefit, swiped sideways
 * from the leftmost. The pages move on by themselves once, a dwell apart, and stop on the
 * last. A touch, a swipe, a tapped dot or the pause control stops them; play resumes, and
 * after the last page it runs one more pass from the first. They never move while a screen
 * reader runs, which also hides the control, or while the app is in the background. A page
 * is one spoken element, its title and its sentence, and a change announces the new title.
 * `initialPage` opens on another page than the leftmost; from the last one nothing moves until
 * play runs a pass from the first.
 */
export function AccountIntroPager({ initialPage }: Readonly<{ initialPage?: AccountIntroPageId }>) {
  const copy = useMessages().account.signIn;
  const theme = useKuyaraTheme();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(() => Math.max(0, accountIntroPageIds.indexOf(initialPage ?? 'closet')));
  // The page shown when the width last changed. The pages take that width only in the render
  // after it is measured, so a scroll then would land on no content: the page is instead the
  // scroll view's starting offset, which changes only with the width.
  const [anchor, setAnchor] = useState(page);
  const [playing, setPlaying] = useState(true);
  const screenReader = useScreenReaderRunning();
  const foreground = useAppInForeground();
  const announced = useRef(page);

  const show = (next: number) => {
    const target = Math.max(0, Math.min(lastPage, next));
    scroll.current?.scrollTo({ x: target * width, animated: true });
    setPage(target);
  };

  const advancing = playing && !screenReader && foreground && width > 0 && page < lastPage;
  useEffect(() => {
    if (!advancing) return;
    const timer = setTimeout(() => {
      scroll.current?.scrollTo({ x: (page + 1) * width, animated: true });
      setPage(page + 1);
    }, ACCOUNT_INTRO_PAGE_DWELL_MS);
    return () => clearTimeout(timer);
  }, [advancing, page, width]);

  useEffect(() => {
    if (announced.current === page) return;
    announced.current = page;
    AccessibilityInfo.announceForAccessibility(copy.pages[accountIntroPageIds[page]].title);
  }, [copy.pages, page]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next === width) return;
    setWidth(next);
    setAnchor(page);
  };
  const onSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };
  const stopAdvancing = () => setPlaying(false);
  const moving = playing && page < lastPage;
  const togglePlaying = () => {
    if (moving) return stopAdvancing();
    if (page === lastPage) show(0);
    setPlaying(true);
  };

  return (
    <View style={styles.pager} testID="account-intro-pager">
      <View onLayout={onLayout}>
        <ScrollView
          contentOffset={{ x: anchor * width, y: 0 }}
          horizontal
          // Where a platform applies the starting offset before the pages are wide, this puts
          // the anchored page in view once they are; the content changes size only with the width.
          onContentSizeChange={(contentWidth) => {
            if (width > 0 && contentWidth >= width * accountIntroPageIds.length) {
              scroll.current?.scrollTo({ x: anchor * width, animated: false });
            }
          }}
          onMomentumScrollEnd={onSettled}
          onScrollBeginDrag={stopAdvancing}
          onTouchStart={stopAdvancing}
          pagingEnabled
          ref={scroll}
          showsHorizontalScrollIndicator={false}
          testID="account-intro-pages">
          {accountIntroPageIds.map((id, index) => {
            const Scene = accountIntroScenes[id];
            const { title, body } = copy.pages[id];
            const active = index === page && width > 0;
            return (
              <View
                accessibilityLabel={`${title}. ${body}`}
                accessible
                key={id}
                style={[styles.pageContent, { width }]}
                testID={`account-intro-page-${id}`}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {width > 0 ? (
                    <Scene
                      active={active}
                      height={SCENE_HEIGHT}
                      key={active ? 'shown' : 'waiting'}
                      width={width - spacing.lg * 2}
                    />
                  ) : null}
                </View>
                <AppText variant="title">{title}</AppText>
                <AppText colorRole="textSecondary">{body}</AppText>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.controls}>
        <View style={styles.dots} testID="account-intro-dots">
          {accountIntroPageIds.map((id, index) => (
            <Pressable
              accessibilityLabel={copy.pagePosition(index + 1, accountIntroPageIds.length)}
              accessibilityRole="button"
              accessibilityState={{ selected: index === page }}
              key={id}
              onPress={() => {
                stopAdvancing();
                show(index);
              }}
              style={styles.dotTarget}
              testID={`account-intro-dot-${id}`}>
              <View
                style={[
                  styles.dot,
                  index === page
                    ? [styles.dotCurrent, { backgroundColor: theme.colors.brandPrimary }]
                    : { backgroundColor: theme.colors.iconSecondary },
                ]}
              />
            </Pressable>
          ))}
        </View>
        {screenReader ? null : (
          <IconButton
            accessibilityLabel={moving ? copy.pausePages : copy.playPages}
            icon={moving ? 'pause' : 'play'}
            onPress={togglePlaying}
            testID="account-intro-play"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { gap: spacing.md },
  pageContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
  controls: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row' },
  dots: { flexDirection: 'row' },
  // Each dot is drawn small but answers a full minimum touch target.
  dotTarget: {
    alignItems: 'center',
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
  dot: { borderRadius: radii.pill, height: spacing.sm, width: spacing.sm },
  dotCurrent: { width: spacing.xl },
});
