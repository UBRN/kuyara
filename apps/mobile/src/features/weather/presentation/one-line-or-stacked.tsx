import { useState } from 'react';

import { AppText, type AppTextProps } from '@/components/ui';

type OneLineOrStackedProps = Omit<AppTextProps, 'children' | 'onTextLayout'> & Readonly<{
  /** The values side by side with a separator between them. */
  line: string;
  /** The same values one per line, with no separator. */
  lines: string;
}>;

/**
 * Values on one line when that line fits. When it wraps, they are shown stacked instead,
 * one value per line, so a separator never sits at a line start or end: measured on the
 * Simulator, iOS breaks even a run held by no-break spaces once that run is wider than its
 * space. The caller keys it by value, text size and width so a change starts again from the
 * one-line form.
 */
export function OneLineOrStacked({ line, lines, ...props }: OneLineOrStackedProps) {
  const [stacked, setStacked] = useState(false);
  return (
    <AppText
      {...props}
      onTextLayout={stacked ? undefined : ({ nativeEvent }) => {
        if (nativeEvent.lines.length > 1) setStacked(true);
      }}>
      {stacked ? lines : line}
    </AppText>
  );
}
