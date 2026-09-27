import { useCallback, useEffect, useRef } from 'react';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useAnalyticsConsentTrigger } from '@/features/analytics/application/analytics-consent-trigger';
import { useAnalyticsConsent } from '@/features/analytics/application/use-analytics-consent';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { AnalyticsConsentScreen } from '@/features/analytics/presentation/analytics-consent-screen';

export default function AnalyticsConsentRoute() {
  const consent = useAnalyticsConsent();
  const isFocused = useRef(false);
  const { presentation } = useLocalSearchParams<{ presentation?: string | string[] }>();
  const nonce = typeof presentation === 'string' ? presentation : undefined;
  const {
    matchesConsentPresentation,
    clearConsentPresentation,
    answeringPresentation,
    answerConsentPresentation,
  } = useAnalyticsConsentTrigger();
  const presentedByToday = matchesConsentPresentation(nonce);
  // Read on focus only: the route's own answer changes consent while it stays focused and
  // closes through `answer` below; an answer given elsewhere (Settings) meanwhile retires it.
  const storedConsent = useRef(consent.consent);
  useEffect(() => { storedConsent.current = consent.consent; }, [consent.consent]);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    if (!matchesConsentPresentation(nonce)) close();
    else if (storedConsent.current !== 'undecided' && nonce) {
      clearConsentPresentation(nonce);
      close();
    }
    return () => { isFocused.current = false; };
  }, [clearConsentPresentation, matchesConsentPresentation, nonce]));

  const answer = (operation: () => Promise<void>) => {
    if (!nonce) return Promise.resolve();
    return answerConsentPresentation(nonce, async () => {
      await operation();
      if (!matchesConsentPresentation(nonce)) return;
      clearConsentPresentation(nonce);
      if (isFocused.current) close();
    });
  };

  return presentedByToday && nonce
    ? <ConsentQuestion
        answerPending={answeringPresentation !== null}
        onAccept={() => answer(() => consent.grant('today_sheet'))}
        onDecline={() => answer(consent.decline)}
      />
    : null;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function ConsentQuestion({ answerPending, onAccept, onDecline }: Readonly<{
  answerPending: boolean;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}>) {
  useScreenViewed('analytics_consent_sheet');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AnalyticsConsentScreen
        answerPending={answerPending}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    </>
  );
}
