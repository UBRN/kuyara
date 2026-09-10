import { useEffect, useRef } from 'react';

export type AnalyticsConsentGateProps = Readonly<{
  shouldPresent: boolean;
  onPresent: () => void;
}>;

export function AnalyticsConsentGate({
  onPresent,
  shouldPresent,
}: AnalyticsConsentGateProps) {
  const hasPresented = useRef(false);

  useEffect(() => {
    if (!shouldPresent || hasPresented.current) return;
    hasPresented.current = true;
    onPresent();
  }, [onPresent, shouldPresent]);

  return null;
}
