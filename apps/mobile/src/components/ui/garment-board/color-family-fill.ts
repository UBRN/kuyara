import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import type { ThemeColorScheme } from '@/theme/theme';

// Approved content colour: ADR 0028 section 6 and ADR 0029 section 5.
// Profile rail and Closet grid only; never a semantic theme role or board fill.
export const colorFamilyFills = {
  light: {
    black: '#5F686C', white: '#FFFFFF', gray: '#B7BEC0', brown: '#B08A6A',
    beige: '#E3D4BC', red: '#D99A94', orange: '#E5B48F', yellow: '#E8D797',
    green: '#A7C4A6', blue: '#A3BBD2', purple: '#BEB0D2', pink: '#E6B9C8',
    multicolor: ['#A3BBD2', '#E8D797'],
  },
  dark: {
    black: '#3A4448', white: '#C9D1D3', gray: '#6F7C80', brown: '#6E5240',
    beige: '#9C8C72', red: '#8E4A46', orange: '#9A643A', yellow: '#9C8A3E',
    green: '#4E7350', blue: '#3F5E7C', purple: '#5E5078', pink: '#8F5468',
    multicolor: ['#3F5E7C', '#9C8A3E'],
  },
} as const satisfies Record<ThemeColorScheme,
  Record<Exclude<ColorFamily, 'multicolor'>, string> & { multicolor: readonly [string, string] }
>;
