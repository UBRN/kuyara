import { createElement, memo, useId, type ComponentType, type ReactElement } from 'react';
import { ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { paintGarment, type GarmentPaintInput, type PaintNode, type PaintTag } from './garment-paint';

export {
  GARMENT_OUTLINE,
  garmentLevelOfDetail,
  WANTED_OUTLINE_DASH,
} from './garment-paint';

const elements: Record<PaintTag, ComponentType<never>> = {
  G, Defs, ClipPath, Path, Rect, LinearGradient, RadialGradient, Stop,
} as unknown as Record<PaintTag, ComponentType<never>>;

function render(node: PaintNode, key?: number): ReactElement {
  return createElement(elements[node.tag], { key, ...node.attrs } as never,
    ...(node.children ?? []).map((child, index) => render(child, index)));
}

/**
 * One drawing, painted in drawing units inside whatever transform the caller sets: a rich
 * illustration lit from the upper left, its form turning at every edge, its cloth woven,
 * folded and seamed, each piece shadowing the one beneath it, inside one ink edge
 * (`garment-paint.ts` owns the art). Memoised on its props, so a board that re-renders with
 * the same outfit, size, colours and level of detail repaints nothing.
 */
export const GarmentPainting = memo(function GarmentPainting(props: Omit<GarmentPaintInput, 'uid'>) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  return render(paintGarment({ ...props, uid }));
});
