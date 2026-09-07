import { useWindowDimensions } from 'react-native';

// ADR 0019 calls for one shared text-scaling hook rather than each caller computing its
// own fontScale > 1.5 threshold. `controlScale` is the capped value list-row controls
// (the tile, its glyph, and the chevron) scale by; `usesStackedLayout` is the same
// threshold used to move a trailing value onto its own line. See ADR 0028 section 3.
export type TextScaling = Readonly<{
  fontScale: number;
  usesStackedLayout: boolean;
  controlScale: number;
}>;

const STACKED_LAYOUT_THRESHOLD = 1.5;
const MAXIMUM_CONTROL_SCALE = 1.5;

export function useTextScaling(): TextScaling {
  const { fontScale } = useWindowDimensions();

  return {
    fontScale,
    usesStackedLayout: fontScale > STACKED_LAYOUT_THRESHOLD,
    controlScale: Math.min(fontScale, MAXIMUM_CONTROL_SCALE),
  };
}
