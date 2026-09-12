import { fireEvent, render } from '@testing-library/react-native';
import { processColor } from 'react-native';

import { GarmentTileArtwork } from '@/components/ui/garment-board/garment-tile-artwork';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const props = {
  photoUri: null,
  garmentTypeId: 't_shirt' as const,
  category: 'top' as const,
  colorFamily: null,
  width: 136,
  height: 170,
  glyphSize: 72,
  photoTestID: 'photo',
  silhouetteTestID: 'silhouette',
  placeholderTestID: 'glyph',
};
const hidden = { includeHiddenElements: true };

// Inspect authored vector props without importing the vector library outside its boundary.
function paths(result: Awaited<ReturnType<typeof render>>) {
  return result.container.queryAll((node) => node.props.d === silhouettes['g-tee'].paths[0].d);
}

test.each([lightTheme, darkTheme])('null colour uses stage and blue uses content fill in $colorScheme', async (theme) => {
  const result = await render(
    <KuyaraThemeContext.Provider value={theme}><GarmentTileArtwork {...props} /></KuyaraThemeContext.Provider>,
  );
  const artwork = result.getByTestId('silhouette', hidden);
  expect(artwork).toHaveProp('accessibilityElementsHidden', true);
  expect(artwork).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(result.queryAllByRole('image')).toHaveLength(0);
  const path = paths(result)[0];
  expect(path.props.fill).toEqual({ type: 0, payload: processColor(theme.colors.stage) });
  expect(path.props.stroke).toEqual({ type: 0, payload: processColor(theme.colors.textPrimary) });
  const bounds = silhouettes['g-tee'].bounds;
  const scale = Math.min(136 * 0.6 / bounds.width, 170 * 0.61 / bounds.height);
  expect(path.props.strokeWidth).toBeCloseTo(1.9 / scale);
  expect(path.props.vectorEffect).toBeUndefined();
  await result.rerender(
    <KuyaraThemeContext.Provider value={theme}><GarmentTileArtwork {...props} colorFamily="blue" /></KuyaraThemeContext.Provider>,
  );
  expect(paths(result)[0].props.fill).toEqual({ type: 0, payload: processColor(theme.colorScheme === 'light' ? '#A3BBD2' : '#3F5E7C') });
});

test.each([lightTheme, darkTheme])('multicolor has a diagonal two-stop gradient unique to each tile in $colorScheme', async (theme) => {
  const result = await render(
    <KuyaraThemeContext.Provider value={theme}>
      <GarmentTileArtwork {...props} colorFamily="multicolor" />
      <GarmentTileArtwork {...props} colorFamily="multicolor" silhouetteTestID="second" />
    </KuyaraThemeContext.Provider>,
  );
  const gradients = result.container.queryAll((node) => node.props.x1 === 0 && node.props.x2 === 1);
  expect(gradients).toHaveLength(2);
  expect(gradients[0].props.name).not.toBe(gradients[1].props.name);
  const expectedStops = theme.colorScheme === 'light' ? ['#A3BBD2', '#E8D797'] : ['#3F5E7C', '#9C8A3E'];
  for (const gradient of gradients) {
    expect(gradient.props).toMatchObject({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(gradient.props.gradient).toEqual([0, Number(processColor(expectedStops[0])) | 0, 1, Number(processColor(expectedStops[1])) | 0]);
    expect(paths(result).some((path) => path.props.fill?.brushRef === gradient.props.name)).toBe(true);
  }
});

test.each([
  { width: 136, height: 170 },
  { width: 272, height: 340 },
  { width: 361, height: 280 },
])('drawn bounds fit uniformly and centrally in $width by $height', async ({ width, height }) => {
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <GarmentTileArtwork {...props} garmentTypeId="dress" width={width} height={height} />
    </KuyaraThemeContext.Provider>,
  );
  const group = result.container.queryAll((node) => Array.isArray(node.props.matrix))[0];
  const [scale, skewY, skewX, scaleY, x, y] = group.props.matrix;
  expect(scaleY).toBeCloseTo(scale);
  expect([skewX, skewY]).toEqual([0, 0]);
  const bounds = silhouettes['g-dress'].bounds;
  expect(scale).toBeCloseTo(Math.min(width * 0.6 / bounds.width, height * 0.61 / bounds.height));
  expect(x + (bounds.x + bounds.width / 2) * scale).toBeCloseTo(width / 2);
  expect(y + (bounds.y + bounds.height / 2) * scale).toBeCloseTo(height / 2);
});

// Accessories draw their own silhouettes under ADR 0025, so only a
// legacy entry without a garment type reaches the category glyph.
test('an unreadable legacy-entry photo falls to the category glyph, and a replacement URI can load', async () => {
  const draw = (photoUri: string) => (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <GarmentTileArtwork {...props} garmentTypeId={null} category="accessory" photoUri={photoUri} />
    </KuyaraThemeContext.Provider>
  );
  const result = await render(draw('file:///old.jpg'));
  await fireEvent(result.getByTestId('photo', hidden), 'error');
  expect(result.getByTestId('glyph', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('silhouette', hidden)).toBeNull();
  await result.rerender(draw('file:///new.jpg'));
  expect(result.getByTestId('photo', hidden)).toHaveProp('source', { uri: 'file:///new.jpg' });
});
