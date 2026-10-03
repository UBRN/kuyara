import assert from 'node:assert/strict';
import test from 'node:test';

import {
  channelsToHex,
  delinearise,
  fromOklch,
  hexChannels,
  isSrgbHex,
  linearRgb,
  toOklab,
  toOklch,
} from './srgb-color.ts';

test('a hex colour is six digits after a hash, in either case, and nothing else', () => {
  for (const value of ['#000000', '#FFFFFF', '#a1B2c3']) assert.equal(isSrgbHex(value), true, value);
  for (const value of ['000000', '#fff', '#12345', '#1234567', '#12345g', ' #123456', '#123456\n', null, 12]) {
    assert.equal(isSrgbHex(value), false, String(value));
  }
});

test('channels read from a hex colour write back as the uppercase hex, clamped and rounded', () => {
  assert.deepEqual(hexChannels('#0a8Fff'), [10, 143, 255]);
  assert.equal(channelsToHex(hexChannels('#0a8Fff')), '#0A8FFF');
  assert.equal(channelsToHex([-5, 127.6, 300]), '#0080FF');
});

test('linearising is the sRGB transfer function and delinearising undoes it', () => {
  assert.deepEqual(linearRgb('#000000'), [0, 0, 0]);
  assert.deepEqual(linearRgb('#FFFFFF'), [1, 1, 1]);
  assert.ok(Math.abs(linearRgb('#808080')[0] - 0.2158605) < 1e-6);
  for (const value of [0, 1, 37, 128, 255]) {
    assert.ok(Math.abs(delinearise(linearRgb(channelsToHex([value, 0, 0]))[0]) - value) < 1e-9, String(value));
  }
});

test('OKLab and OKLCH of white, black and a saturated colour match the reference values', () => {
  const [L, A, B] = toOklab('#FFFFFF');
  assert.ok(Math.abs(L - 1) < 1e-4 && Math.abs(A) < 1e-4 && Math.abs(B) < 1e-4);
  assert.deepEqual(toOklab('#000000'), [0, 0, 0]);
  const red = toOklch('#FF0000');
  assert.ok(Math.abs(red.L - 0.62796) < 1e-4);
  assert.ok(Math.abs(red.C - 0.25768) < 1e-4);
  assert.ok(Math.abs(red.H - 29.234) < 1e-2);
});

test('a colour survives the trip through OKLCH', () => {
  for (const hex of ['#26334F', '#B7854D', '#F4F3EE', '#2F5BA6', '#25272B']) {
    const { L, C, H } = toOklch(hex);
    assert.equal(fromOklch(L, C, H), hex);
  }
});

test('a colour outside sRGB loses chroma and keeps its hue', () => {
  const clipped = fromOklch(0.7, 0.4, 142);
  assert.equal(isSrgbHex(clipped), true);
  assert.ok(Math.abs(toOklch(clipped).H - 142) < 3);
});
