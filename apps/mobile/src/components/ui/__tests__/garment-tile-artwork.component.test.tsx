import { fireEvent, render } from '@testing-library/react-native';
import { processColor } from 'react-native';

import { ClosetColorDisc } from '@/components/ui/garment-board/closet-color-art';
import { garmentFillForAppearance, garmentFillRoles, legalizeGarmentFill } from '@/components/ui/garment-board/garment-palette';
import { GarmentTileArtwork } from '@/components/ui/garment-board/garment-tile-artwork';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { blend } from '@/theme/color-blend';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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

// A clip path's own shape is geometry, not paint; skip it when reading drawn fills.
const insideClip = (node: { type: unknown; parent: unknown }): boolean => {
  for (let at = node.parent as { type: unknown; parent: unknown } | null; at; at = at.parent as typeof at) {
    if (String(at.type).includes('ClipPath')) return true;
  }
  return false;
};

const teeOutline = silhouettes['g-tee'].groups[0].outline;

// Inspect authored vector props without importing the vector library outside its boundary:
// the outline is filled once and stroked once (the ink edge), and also clips its parts.
function paths(result: Awaited<ReturnType<typeof render>>) {
  return result.container.queryAll((node) => node.props.d === teeOutline && node.props.strokeWidth == null
    && node.props.fill != null && node.props.fill !== 'none' && !insideClip(node));
}
function edges(result: Awaited<ReturnType<typeof render>>) {
  return result.container.queryAll((node) => node.props.d === teeOutline && node.props.strokeWidth != null);
}

test.each([lightTheme, darkTheme])('null colour uses the page ground\u2019s neutral and blue uses the content fill in $colorScheme', async (theme) => {
  const result = await render(
    <KuyaraThemeContext.Provider value={theme}><GarmentTileArtwork {...props} /></KuyaraThemeContext.Provider>,
  );
  const artwork = result.getByTestId('silhouette', hidden);
  expect(artwork).toHaveProp('accessibilityElementsHidden', true);
  expect(artwork).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(result.queryAllByRole('image')).toHaveLength(0);
  const path = paths(result)[0];
  // A record the owner left colourless is drawn in the neutral derived from the page
  // ground, never guessed at. In the light appearance that is `stage` to the pixel.
  expect(path.props.fill).toEqual({
    type: 0,
    payload: processColor(blend(theme.colors.background, theme.colors.textPrimary, 0.13)),
  });
  const [edge] = edges(result);
  expect(edge.props.stroke).toEqual({ type: 0, payload: processColor(theme.colors.textPrimary) });
  const bounds = silhouettes['g-tee'].bounds;
  const scale = Math.min(136 * 0.6 / bounds.width, 170 * 0.61 / bounds.height);
  expect(edge.props.strokeWidth).toBeCloseTo(1.9 / scale);
  expect(edge.props.vectorEffect).toBeUndefined();
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

// Phase 6's level of detail: below 32 points the tone lines and stitches drop out, while the
// fills, the shade planes and the construction line stay.
test('a drawing below 32 points drops tone lines and stitches, and keeps its construction', async () => {
  const dashed = (result: Awaited<ReturnType<typeof render>>) =>
    result.container.queryAll((node) => node.props.strokeDasharray != null && node.props.d != null);
  const construction = 'M25 14.5 Q32 20.2 39 14.5';
  const draw = (width: number, height: number) => (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <GarmentTileArtwork {...props} width={width} height={height} />
    </KuyaraThemeContext.Provider>
  );
  const board = await render(draw(136, 170));
  expect(dashed(board).length).toBeGreaterThan(0);
  const caption = await render(draw(40, 44));
  expect(dashed(caption)).toHaveLength(0);
  expect(caption.container.queryAll((node) => node.props.d === construction && node.props.strokeWidth != null))
    .toHaveLength(1);
  expect(paths(caption)).toHaveLength(1);
});

// O8: a Closet piece's own palette colour, custom colour or pattern, on the edit surfaces and
// the detail's "Yours". A solid is kept legible on the ground; a pattern fills the main
// surfaces with its repeat; an option this build does not know draws the family fill.
describe('a Closet colour choice', () => {
  const draw = (theme: typeof lightTheme | typeof darkTheme, extra: Partial<React.ComponentProps<typeof GarmentTileArtwork>>) => render(
    <KuyaraThemeContext.Provider value={theme}><GarmentTileArtwork {...props} {...extra} /></KuyaraThemeContext.Provider>,
  );
  const patternOf = (result: Awaited<ReturnType<typeof render>>) => {
    const ref = paths(result)[0].props.fill?.brushRef as string | undefined;
    return ref ? result.container.queryAll((node) => node.props.name === ref && String(node.type).includes('Pattern'))[0] : undefined;
  };

  test.each([lightTheme, darkTheme])('a palette solid and a custom colour draw their own colour in $colorScheme', async (theme) => {
    const solid = await draw(theme, { colorFamily: 'blue', colorChoice: { kind: 'option', id: 'mid_wash_denim' } });
    const expected = legalizeGarmentFill(garmentFillForAppearance('#5A7DA7', theme.isDark), theme.colors.background, theme.colors.textPrimary).hex;
    expect(paths(solid)[0].props.fill).toEqual({ type: 0, payload: processColor(expected) });
    expect(patternOf(solid)).toBeUndefined();

    const custom = await draw(theme, { colorFamily: 'green', colorChoice: { kind: 'custom', hex: '#3C8D2F' } });
    const customExpected = legalizeGarmentFill(garmentFillForAppearance('#3C8D2F', theme.isDark), theme.colors.background, theme.colors.textPrimary).hex;
    expect(paths(custom)[0].props.fill).toEqual({ type: 0, payload: processColor(customExpected) });
  });

  test('a pattern fills the main surfaces with its own repeat, one per drawing', async () => {
    const result = await render(
      <KuyaraThemeContext.Provider value={lightTheme}>
        <GarmentTileArtwork {...props} colorChoice={{ kind: 'option', id: 'blue_stripes' }} colorFamily="white" />
        <GarmentTileArtwork {...props} colorChoice={{ kind: 'option', id: 'blue_stripes' }} colorFamily="white"
          silhouetteTestID="second" />
      </KuyaraThemeContext.Provider>,
    );
    const patterns = result.container.queryAll((node) => String(node.type).includes('Pattern') && node.props.name != null);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].props.name).not.toBe(patterns[1].props.name);
    expect(paths(result).some((path) => path.props.fill?.brushRef === patterns[0].props.name)).toBe(true);
    // Blue stripes: the white ground and the cobalt band, in the light appearance as stored.
    const fills = result.container.queryAll((node) => node.props.fill != null && node.props.fill.type === 0)
      .map((node) => node.props.fill.payload);
    expect(fills).toEqual(expect.arrayContaining([processColor('#F4F3EE'), processColor('#2F5BA6')]));
  });

  test.each(['white_and_black', 'navy_and_camel', 'navy_stripes', 'blue_gingham', 'tartan', 'houndstooth',
    'polka_dots', 'floral', 'leopard'])('%s draws as a pattern', async (id) => {
    const result = await draw(lightTheme, { colorChoice: { kind: 'option', id } });
    expect(patternOf(result)).toBeDefined();
  });

  test('an unknown stored option and a missing choice draw the family fill; outfit roles win', async () => {
    const family = { type: 0, payload: processColor('#A3BBD2') };
    const unknown = await draw(lightTheme, { colorFamily: 'blue', colorChoice: { kind: 'option', id: 'from_a_later_build' } });
    expect(paths(unknown)[0].props.fill).toEqual(family);
    const legacy = await draw(lightTheme, { colorFamily: 'blue', colorChoice: null });
    expect(paths(legacy)[0].props.fill).toEqual(family);
    const outfit = await draw(lightTheme, {
      colorChoice: { kind: 'option', id: 'tartan' }, roles: garmentFillRoles('g-tee', '#335577', 'light'),
    });
    expect(paths(outfit)[0].props.fill).toEqual({ type: 0, payload: processColor('#335577') });
    expect(patternOf(outfit)).toBeUndefined();
  });
});

test('a colour disc names nothing itself and checks a selected choice in a legible ink', async () => {
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <ClosetColorDisc choice={{ kind: 'option', id: 'white' }} selected size={36} testID="white" />
      <ClosetColorDisc choice={{ kind: 'option', id: 'black' }} size={36} testID="black" />
      <ClosetColorDisc choice={{ kind: 'option', id: 'from_a_later_build' }} size={36} testID="unknown" />
    </KuyaraThemeContext.Provider>,
  );
  expect(result.getByTestId('white', hidden)).toHaveProp('accessibilityElementsHidden', true);
  expect(result.queryByTestId('unknown', hidden)).toBeNull();
  expect(result.getByTestId('white-check', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('black-check', hidden)).toBeNull();
});
