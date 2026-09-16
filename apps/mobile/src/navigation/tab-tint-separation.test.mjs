import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createKuyaraTheme } from '../theme/theme.ts';

// ADR 0027 section 3: the tab bar's tint is `brandPrimary`, drawn by the OS on Liquid
// Glass over whatever scrolls beneath the bar. On Today that can be any atmosphere stage,
// so the tint must stay differentiated from every stage tone and from the page background
// in both appearances. 3:1 is the WCAG 2 non-text floor; the measured minimum is 5.21:1.
const NON_TEXT_FLOOR = 3;

function hexToLinearChannels(hex) {
  return [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
}

function relativeLuminance(hex) {
  const [red, green, blue] = hexToLinearChannels(hex);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foregroundHex, backgroundHex) {
  const [lighter, darker] = [relativeLuminance(foregroundHex), relativeLuminance(backgroundHex)]
    .sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('the tab bar tints with brandPrimary and sets no bar background of its own', async () => {
  const source = await readFile(new URL('./primary-tabs.tsx', import.meta.url), 'utf8');

  assert.match(source, /tintColor=\{theme\.colors\.brandPrimary\}/);
  assert.doesNotMatch(source, /backgroundColor=|blurEffect=/);
});

test('brandPrimary clears the non-text floor over every atmosphere stage and the background', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');

  for (const appearance of ['light', 'dark']) {
    const theme = createKuyaraTheme(appearance);
    const tint = theme.colors.brandPrimary;
    const backdrops = { ...theme.atmosphere, background: theme.colors.background };

    for (const [name, backdrop] of Object.entries(backdrops)) {
      const ratio = contrastRatio(tint, backdrop);
      assert.ok(
        ratio >= NON_TEXT_FLOOR,
        `${appearance} tint ${tint} over ${name} ${backdrop}: ${ratio.toFixed(2)}:1`,
      );
    }
  }
});
