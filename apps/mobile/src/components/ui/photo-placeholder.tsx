import { StyleSheet, View, type DimensionValue } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { withAlpha } from '@/theme/color-alpha';
import { useKuyaraTheme } from '@/theme/theme-context';

export type PhotoPlaceholderProps = Readonly<{
  width: DimensionValue;
  height: number;
  borderRadius: number;
  label: string;
  testID?: string;
}>;

const STRIPE_WIDTH = 6;
const STRIPE_GAP = 10;
const STRIPE_SPAN_PADDING = 120;

function buildStripeOffsets(spanWidth: number): readonly number[] {
  const offsets: number[] = [];

  for (let offset = -STRIPE_SPAN_PADDING; offset <= spanWidth + STRIPE_SPAN_PADDING; offset += STRIPE_GAP) {
    offsets.push(offset);
  }

  return offsets;
}

export function PhotoPlaceholder({
  width,
  height,
  borderRadius,
  label,
  testID,
}: PhotoPlaceholderProps) {
  const theme = useKuyaraTheme();
  const stripeSpan = typeof width === 'number' ? width : height;
  const stripeOffsets = buildStripeOffsets(stripeSpan);
  const stripeColor = withAlpha(theme.colors.brandAccent, 0.15);
  const stripeHeight = height + STRIPE_SPAN_PADDING * 2;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          backgroundColor: withAlpha(theme.colors.brandAccent, 0.05),
        },
      ]}
      testID={testID}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stripeOffsets.map((offset) => (
          <View
            key={offset}
            style={[
              styles.stripe,
              {
                backgroundColor: stripeColor,
                height: stripeHeight,
                left: offset,
                top: -STRIPE_SPAN_PADDING,
              },
            ]}
          />
        ))}
      </View>
      <AppText colorRole="textSecondary" variant="code">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: STRIPE_WIDTH,
  },
});
