import { render } from '@testing-library/react-native';
import { GarmentSlotGlyph } from '@/components/ui/garment-slot-glyph';

// ADR 0025 consequences (2026-09-07): two raster classes of the same drawings. The small
// 24 point export serves the 20 to 28 point glyphs; the large 72 point export serves the
// rail and grid tiles so a tile never scales the small PNG past its export size.
async function sourceOf(size: number) {
  const result = await render(<GarmentSlotGlyph category="top" color="#000000" size={size} />);
  // GarmentSlotGlyph renders a single Image, so the tree's root is that host node.
  const tree = result.toJSON() as unknown as { props: { source: unknown } };
  return tree.props.source;
}

test('a row-sized glyph reads the small raster class and a tile-sized glyph reads the large one', async () => {
  const small = await sourceOf(20);
  const rowTile = await sourceOf(28);
  const large = await sourceOf(72);

  expect(small).toEqual(rowTile);
  expect(large).not.toEqual(small);
});
