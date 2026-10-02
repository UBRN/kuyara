import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { AppText } from '@/components/ui';
import {
  ACCOUNT_INTRO_PAGE_DWELL_MS,
  accountIntroPageIds,
} from '@/features/account/application/account-intro-pages';
import { accountIntroScenes } from '@/features/account/presentation/account-intro-scenes';
import { useMessages } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
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
 * last. The first touch, swipe or dot adjustment hands them to the person for the rest of the
 * visit; they never move while a screen reader runs or the app is in the background. A page
 * is one spoken element, its title and its sentence, and a change announces the new title.
 */
export function AccountIntroPager() {
  const copy = useMessages().account.signIn;
  const theme = useKuyaraTheme();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [handedOver, setHandedOver] = useState(false);
  const screenReader = useScreenReaderRunning();
  const foreground = useAppInForeground();
  const announced = useRef(page);

  const show = (next: number) => {
    const target = Math.max(0, Math.min(lastPage, next));
    scroll.current?.scrollTo({ x: target * width, animated: true });
    setPage(target);
  };

  const advancing = !handedOver && !screenReader && foreground && width > 0 && page < lastPage;
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
    scroll.current?.scrollTo({ x: page * next, animated: false });
  };
  const onSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };
  const handOver = () => setHandedOver(true);

  return (
    <View style={styles.pager} testID="account-intro-pager">
      <View onLayout={onLayout}>
        <ScrollView
          horizontal
          onMomentumScrollEnd={onSettled}
          onScrollBeginDrag={handOver}
          onTouchStart={handOver}
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
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel={copy.pageIndicator}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: copy.pagePosition(page + 1, accountIntroPageIds.length) }}
        accessible
        onAccessibilityAction={(event) => {
          handOver();
          show(page + (event.nativeEvent.actionName === 'increment' ? 1 : -1));
        }}
        style={styles.dots}
        testID="account-intro-dots">
        {accountIntroPageIds.map((id, index) => (
          <View
            key={id}
            style={[
              styles.dot,
              index === page
                ? [styles.dotCurrent, { backgroundColor: theme.colors.brandPrimary }]
                : { backgroundColor: theme.colors.iconSecondary },
            ]}
            testID={index === page ? 'account-intro-dot-current' : `account-intro-dot-${id}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { gap: spacing.md },
  pageContent: { gap: spacing.md, paddingHorizontal: spacing.lg },
  dots: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  dot: { borderRadius: radii.pill, height: spacing.sm, width: spacing.sm },
  dotCurrent: { width: spacing.xl },
});
