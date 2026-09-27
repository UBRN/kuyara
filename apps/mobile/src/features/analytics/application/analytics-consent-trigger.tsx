import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Crypto from 'expo-crypto';

export type AnalyticsConsentTriggerValue = Readonly<{
  recommendationShown: boolean;
  markRecommendationShown: () => void;
  beginConsentPresentation: () => string;
  matchesConsentPresentation: (nonce: string | undefined) => boolean;
  clearConsentPresentation: (nonce: string) => void;
  answeringPresentation: string | null;
  answerConsentPresentation: (nonce: string, answer: () => Promise<void>) => Promise<void>;
}>;

export const AnalyticsConsentTriggerContext =
  createContext<AnalyticsConsentTriggerValue | null>(null);

export function AnalyticsConsentTriggerProvider({ children }: PropsWithChildren) {
  const [recommendationShown, setRecommendationShown] = useState(false);
  const [answeringPresentation, setAnsweringPresentation] = useState<string | null>(null);
  const presentationPending = useRef<string | null>(null);
  const answerInFlight = useRef<Promise<void> | null>(null);
  const markRecommendationShown = useCallback(() => setRecommendationShown(true), []);
  const beginConsentPresentation = useCallback(
    () => (presentationPending.current = Crypto.randomUUID()), []);
  const matchesConsentPresentation = useCallback(
    (nonce: string | undefined) => !!nonce && presentationPending.current === nonce, []);
  const clearConsentPresentation = useCallback((nonce: string) => {
    if (presentationPending.current === nonce) presentationPending.current = null;
  }, []);
  const answerConsentPresentation = useCallback((nonce: string, answer: () => Promise<void>) => {
    if (presentationPending.current !== nonce || answerInFlight.current) return Promise.resolve();
    const pending = Promise.resolve().then(answer).finally(() => {
      answerInFlight.current = null;
      setAnsweringPresentation(null);
    });
    answerInFlight.current = pending;
    setAnsweringPresentation(nonce);
    return pending;
  }, []);
  const value = useMemo(
    () => ({ recommendationShown, markRecommendationShown, beginConsentPresentation,
      matchesConsentPresentation, clearConsentPresentation, answeringPresentation,
      answerConsentPresentation }),
    [recommendationShown, markRecommendationShown, beginConsentPresentation,
      matchesConsentPresentation, clearConsentPresentation, answeringPresentation,
      answerConsentPresentation],
  );

  return (
    <AnalyticsConsentTriggerContext value={value}>
      {children}
    </AnalyticsConsentTriggerContext>
  );
}

export function useAnalyticsConsentTrigger(): AnalyticsConsentTriggerValue {
  const value = use(AnalyticsConsentTriggerContext);
  if (!value) {
    throw new Error(
      'useAnalyticsConsentTrigger must be used within AnalyticsConsentTriggerProvider',
    );
  }
  return value;
}
