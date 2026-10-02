import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SWAP_COMMIT_VELOCITY,
  SWAP_GROW_MAX,
  SWAP_GROW_MIN,
  SWAP_STEP_BACK,
  SWAP_STRIP_COLUMNS,
  swapCommitDirection,
  swapDragOffset,
  swapDragZone,
  swapEntryBox,
  swapExitOffset,
  swapGrownBox,
  swapGrowScale,
  swapHeldStage,
  swapHitSlot,
  swapMarkerPosition,
  swapRubberBand,
  swapScaledBox,
  swapStride,
  swapRevealScroll,
  swapStageFit,
  swapStripLayout,
  swapWindow,
} from './swap-gesture.ts';
import { easierToSeeRule, composeGarmentBoard, detailPreset, todayPreset } from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { recommendOutfits } from '../../../features/recommendation/application/recommend-outfits.ts';
import { getGarmentType } from '../../../features/catalog/domain/garment-catalog.ts';
import {
  availableCandidates,
  outfitGarments,
  outfitSwappableSlots,
  slotCandidates,
} from '../../../features/recommendation/domain/manual-mix.ts';

// Phase 7b's board swap, vault phase-7b final-spec sections 4, 5 and 10: the geometry and
// thresholds a device run then feels.

const apart = (a, b, gap) =>
  a.x >= b.x + b.w + gap || b.x >= a.x + a.w + gap || a.y >= b.y + b.h + gap || b.y >= a.y + a.h + gap;

test('the grid holds at most seven tiles a row, in ceil(n / 7) rows, and never wider than the column', () => {
  for (let n = 1; n <= 21; n += 1) {
    const strip = swapStripLayout(n, n, 361);
    assert.equal(strip.rows, Math.ceil(n / SWAP_STRIP_COLUMNS));
    assert.equal(strip.width, 356);
    assert.ok(strip.width <= 361);
    for (let row = 0; row < strip.rows; row += 1) {
      assert.ok(strip.tiles.filter(({ y }) => y === row * 52).length <= SWAP_STRIP_COLUMNS);
    }
    assert.equal(strip.height, strip.rows * 44 + (strip.rows - 1) * 8);
    assert.ok(strip.tiles.every(({ x }) => x + 44 <= strip.width));
  }
  // Today's most, 13, is two rows; 14 still fits two.
  assert.equal(swapStripLayout(13, 9, 361).rows, 2);
  assert.equal(swapStripLayout(14, 9, 361).height, 2 * 44 + 8);
});

test('a 343-point column (375-point phones) holds six tiles a row, so 13 candidates take three rows', () => {
  const narrow = swapStripLayout(13, 9, 343);
  assert.equal(narrow.columns, 6);
  assert.equal(narrow.rows, 3);
  assert.equal(narrow.width, 6 * 52 - 8);
  assert.equal(narrow.height, 3 * 44 + 2 * 8);
  assert.equal(swapStripLayout(12, 9, 343).rows, 2);
  // A hairline at a row start stays inside the narrower grid.
  assert.ok(swapStripLayout(13, 6, 343).hairline.x + 1 <= narrow.width + 8);
  // 390-point phones (a 358-point column) and wider hold seven.
  for (const column of [358, 370]) {
    assert.equal(swapStripLayout(13, 9, column).columns, SWAP_STRIP_COLUMNS);
    assert.equal(swapStripLayout(13, 9, column).rows, 2);
  }
});

test('the reveal scrolls the least that shows the strip, and never the enlarged piece off the top', () => {
  const visible = { top: 20 + 44, bottom: 667 - 49 };
  assert.equal(swapRevealScroll({ pieceTop: 10, panelBottom: 300 }, 100, visible), 0);
  assert.equal(swapRevealScroll({ pieceTop: 10, panelBottom: 500 }, 200, visible), 200 + 500 + 12 - 618);
  // No room for both: the piece's top stops `spacing.md` under the visible top.
  assert.equal(swapRevealScroll({ pieceTop: 0, panelBottom: 598 }, 150, visible), 150 - 12 - 64);
  assert.equal(swapRevealScroll({ pieceTop: 0, panelBottom: 598 }, 40, visible), 0);
});

// Final-spec sections 3 and 7 on a 375-point phone: the enlarged piece's top, the held stage,
// the strip's header and three rows of six, from real women's outfits on cold days (the
// 13-candidate top). The visible area is the window less the status bar, the 44-point
// navigation bar, the home indicator and the 49-point tab bar the detail screen assumes; the
// Simulator pass confirms those two bar heights.
function day(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'strip-reveal' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}

/** Every three-row enlargement: its held stage and its strip's height (header, gap and grid). */
function threeRowEnlargements(column, large) {
  const rule = large ? easierToSeeRule(detailPreset, 1.3, 0.05) : detailPreset;
  const compose = (pieces) => {
    const result = composeGarmentBoard(pieces.map((piece) => ({
      ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
    })), rule);
    const boxes = new Map(result.order.map((piece) => {
      const box = result.boxes.get(piece);
      return [piece.slot, { x: box.x * column, y: box.y * column, w: box.w * column, h: box.h * column }];
    }));
    return { boxes, order: result.order.map(({ slot }) => slot), height: result.stageHeight * column };
  };
  const header = large ? 56 : 44;
  const found = [];
  for (const temperature of [-15, -8, 4, 12]) {
    for (const [condition, rain] of [['clear', 0], ['snow', 0.6]]) {
      const snapshot = day(temperature, condition, rain);
      const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: 'womens', dayVariant: 0 });
      if (result.status !== 'recommended') continue;
      for (const outfit of result.outfits) {
        const garments = outfitGarments(outfit);
        const pieces = Object.entries(garments).map(([slot, garmentTypeId]) => ({
          slot, garmentTypeId, category: getGarmentType(garmentTypeId).structuralCategory,
        }));
        for (const slot of outfitSwappableSlots(outfit)) {
          const shown = availableCandidates(slotCandidates(outfit, slot, result.requirements, 'womens'), slot, garments);
          const strip = swapStripLayout(shown.length, shown.filter(({ suitable }) => suitable).length, column);
          if (strip.rows < 3) continue;
          const current = compose(pieces);
          const layouts = [current, ...shown.map(({ garmentTypeId }) => compose(pieces.map((piece) => (piece.slot === slot
            ? { ...piece, garmentTypeId, category: getGarmentType(garmentTypeId).structuralCategory } : piece))))]
            .map((composed) => ({
              box: composed.boxes.get(slot),
              others: composed.order.filter((other) => other !== slot).map((other) => composed.boxes.get(other)),
              stageWidth: column,
              stageHeight: composed.height,
            }));
          found.push({
            held: Math.max(swapHeldStage(layouts, swapGrowScale(layouts)), current.height),
            panel: header + 8 + strip.height,
          });
        }
      }
    }
  }
  return found;
}

test('on a 375-point phone the enlarged board fits three rows above the tab bar, Easier to see included', () => {
  // 375 x 667 (iPhone SE): 667 - 20 - 44 - 49 = 554 points show; 375 x 812 (iPhone 13 mini):
  // 812 - 50 - 44 - 34 - 49 = 635.
  for (const [large, visible] of [[false, 554], [false, 635], [true, 554], [true, 635]]) {
    const found = threeRowEnlargements(343, large);
    assert.ok(found.length > 0, 'a cold women\'s day offers the 13-candidate top');
    // Full width, the tallest does not fit the SE: the board has to compose narrower.
    if (visible === 554) assert.ok(found.some(({ held, panel }) => 12 + held + 12 + panel + 12 > visible));
    for (const { held, panel } of found) {
      const fit = swapStageFit(held, panel, visible);
      assert.ok(fit > 1 / SWAP_GROW_MIN, `the floor binds: ${held.toFixed(1)} + ${panel}`);
      assert.ok(12 + held * fit + 12 + panel + 12 <= visible + 1e-9);
    }
  }
});

test('the hairline stands before the first unsuitable tile, after the row above at a row start, and not at all at an end', () => {
  // Mid-row: in the gap before tile 3.
  assert.deepEqual(swapStripLayout(12, 3, 361).hairline, { x: 3 * 52 - 4 - 0.5, y: 10 });
  // Row start: after the seventh tile of the row above, still inside a 361 pt column.
  const rowStart = swapStripLayout(12, 7, 361).hairline;
  assert.deepEqual(rowStart, { x: 359.5, y: 10 });
  assert.ok(rowStart.x + 1 <= 361);
  assert.equal(swapStripLayout(12, 0, 361).hairline, null);
  assert.equal(swapStripLayout(12, 12, 361).hairline, null);
});

test('the grow scale clears every stepped-back piece by spacing.sm, or is the floor', () => {
  const stage = { stageWidth: 358, stageHeight: 400 };
  // A lone piece with room grows the full 2x.
  assert.equal(swapGrowScale([{ box: { x: 150, y: 150, w: 50, h: 50 }, others: [], ...stage }]), SWAP_GROW_MAX);
  // A close neighbour limits it; the result still clears it by 8.
  const box = { x: 100, y: 100, w: 60, h: 60 };
  const other = { x: 189, y: 100, w: 60, h: 60 };
  const scale = swapGrowScale([{ box, others: [other], ...stage }]);
  assert.ok(scale > SWAP_GROW_MIN && scale < SWAP_GROW_MAX);
  assert.ok(apart(swapGrownBox(box, scale, 358, 400), swapScaledBox(other, SWAP_STEP_BACK), 8));
  assert.ok(!apart(swapGrownBox(box, scale + 0.01, 358, 400), swapScaledBox(other, SWAP_STEP_BACK), 8));
  // The tightest candidate decides for the whole slot, and a crowded one takes the floor.
  const crowded = { box, others: [{ x: 165, y: 100, w: 60, h: 60 }], ...stage };
  assert.equal(swapGrowScale([{ box, others: [], ...stage }, crowded]), SWAP_GROW_MIN);
});

test('the grown box stays on the stage', () => {
  assert.deepEqual(swapGrownBox({ x: 0, y: 0, w: 50, h: 40 }, 2, 358, 400), { x: 0, y: 0, w: 100, h: 80 });
  assert.deepEqual(swapGrownBox({ x: 300, y: 350, w: 50, h: 40 }, 2, 358, 400), { x: 258, y: 320, w: 100, h: 80 });
});

test('the held stage is the tallest candidate stage, or the tallest candidate grown', () => {
  const layout = (stageHeight, h) => ({ box: { x: 0, y: 0, w: 50, h }, others: [], stageWidth: 358, stageHeight });
  assert.equal(swapHeldStage([layout(312, 100), layout(348.5, 100), layout(330, 100)], 2), 348.5);
  // A dress that fills most of its stage would be cut by the window's top edge at 1.79x.
  assert.equal(swapHeldStage([layout(252.6, 152.1)], 1.79), 152.1 * 1.79);
});

test('every candidate of a real outfit, grown, fits the held stage', () => {
  const column = 349;
  const compose = (pieces) => {
    const result = composeGarmentBoard(pieces.map((piece) => ({
      ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
    })), detailPreset);
    const boxes = new Map(result.order.map((piece) => {
      const box = result.boxes.get(piece);
      return [piece.slot, { x: box.x * column, y: box.y * column, w: box.w * column, h: box.h * column }];
    }));
    return { boxes, order: result.order.map(({ slot }) => slot), height: result.stageHeight * column };
  };
  const outfits = [
    [['one_piece', 'knit_dress', 'one_piece'], ['outer_layer', 'rain_jacket', 'outerwear'], ['footwear', 'loafers', 'footwear']],
    [['one_piece', 'dress', 'one_piece'], ['outer_layer', 'trench_coat', 'outerwear'], ['footwear', 'ankle_boots', 'footwear']],
    [['primary_top', 'sweater', 'top'], ['bottom', 'trousers', 'bottom'], ['outer_layer', 'parka', 'outerwear'], ['footwear', 'rain_boots', 'footwear']],
    [['primary_top', 't_shirt', 'top'], ['bottom', 'jeans', 'bottom'], ['outer_layer', 'coat', 'outerwear'], ['footwear', 'weather_boots', 'footwear']],
  ];
  for (const outfit of outfits) {
    const composed = compose(outfit.map(([slot, garmentTypeId, category]) => ({ slot, garmentTypeId, category })));
    for (const slot of composed.order) {
      const layouts = [{
        box: composed.boxes.get(slot),
        others: composed.order.filter((other) => other !== slot).map((other) => composed.boxes.get(other)),
        stageWidth: column,
        stageHeight: composed.height,
      }];
      const scale = swapGrowScale(layouts);
      const held = swapHeldStage(layouts, scale);
      const grown = swapGrownBox(layouts[0].box, scale, column, held);
      assert.ok(grown.y >= 0 && grown.y + grown.h <= held + 1e-9, `${slot} of ${outfit[0][1]}`);
      assert.ok(grown.x >= 0 && grown.x + grown.w <= column + 1e-9, `${slot} of ${outfit[0][1]}`);
    }
  }
});

test('the paging window never covers a stepped-back piece and reaches at most a touch target beside the grown box', () => {
  const grown = { x: 120, y: 20, w: 100, h: 140 };
  const open = swapWindow(grown, [], 358, 300);
  assert.deepEqual(open, { x: 76, y: 0, w: 188, h: 300, padLeft: 44, padRight: 44 });
  // The window reaches the outline past the held stage, so a piece on its top edge keeps its ink.
  assert.deepEqual(swapWindow(grown, [], 358, 300, 1.9), { x: 76, y: -1.9, w: 188, h: 303.8, padLeft: 44, padRight: 44 });
  const left = { x: 20, y: 30, w: 80, h: 80 };
  const right = { x: 240, y: 200, w: 60, h: 60 };
  const tight = swapWindow(grown, [left, right], 358, 300);
  assert.equal(tight.x, 100);
  assert.equal(tight.x + tight.w, 240);
  for (const other of [left, right]) assert.ok(apart(tight, other, 0));
  assert.ok(tight.padLeft <= 44 && tight.padRight <= 44);
  // Never past the stage.
  const edge = swapWindow({ x: 10, y: 0, w: 100, h: 100 }, [], 358, 300);
  assert.equal(edge.x, 0);
  assert.equal(edge.padLeft, 10);
});

test('a step is the grown width plus the window pad and the outline on its side, never under two touch targets', () => {
  const grown = { x: 120, y: 20, w: 100, h: 140 };
  const window = swapWindow(grown, [], 358, 300);
  assert.equal(swapStride(window, grown, 1, 1.9), 145.9);
  assert.equal(swapStride(window, grown, -1, 1.9), 145.9);
  const edge = swapWindow({ x: 10, y: 0, w: 100, h: 100 }, [], 358, 300);
  assert.equal(swapStride(edge, { x: 10, y: 0, w: 100, h: 100 }, -1, 1.9), 111.9);
  const small = { x: 150, y: 20, w: 20, h: 20 };
  assert.equal(swapStride({ x: 150, w: 20 }, small, 1, 1.9), 88);
});

test('a neighbour of any width waits wholly behind the window edge, its outline included, on both sides', () => {
  // An ink edge is drawn half outside its box and anti-aliased, so a box
  // standing exactly on the window's edge still shows a line of it there. Every pair of an
  // enlarged width and a neighbour width, on both sides and at both outline weights, keeps
  // the whole outline weight between the neighbour's box and the edge.
  for (const outline of [1.9, 2.8]) {
    for (const enlarged of [40, 80, 120, 160]) {
      const piece = { x: 179 - enlarged / 2, y: 20, w: enlarged, h: 120 };
      const window = swapWindow(piece, [], 358, 300);
      for (const width of [40, 80, 120, 160, 200, 240]) {
        const neighbour = { x: 179 - width / 2, y: 20, w: width, h: 120 };
        const next = swapStride(window, neighbour, 1, outline);
        const previous = swapStride(window, neighbour, -1, outline);
        assert.ok(neighbour.x + next >= window.x + window.w + outline - 1e-9, `next ${enlarged} ${width}`);
        assert.ok(neighbour.x + neighbour.w - previous <= window.x - outline + 1e-9, `previous ${enlarged} ${width}`);
      }
    }
  }
});

test('the drag zone is the grown piece with spacing.md around it, at least 88 square, inside the stage', () => {
  assert.deepEqual(swapDragZone({ x: 100, y: 100, w: 100, h: 100 }, 400), { x: 88, y: 88, w: 124, h: 124 });
  assert.deepEqual(swapDragZone({ x: 100, y: 0, w: 20, h: 20 }, 400), { x: 66, y: 0, w: 88, h: 54 });
});

test('the rubber band is UIScrollView\'s: 120 pt past an end shows as 37.7 pt at an 88 pt stride', () => {
  assert.equal(Math.round(swapRubberBand(120, 88) * 10) / 10, 37.7);
  assert.equal(swapRubberBand(0, 88), 0);
});

test('a drag tracks the finger for one stride, resists beyond it, and resists wholly at an end', () => {
  // Finger left: the next candidate.
  assert.equal(swapDragOffset(-40, 88, true, true), -40);
  assert.equal(swapDragOffset(-120, 88, true, true), -(88 + swapRubberBand(32, 88)));
  assert.equal(swapDragOffset(-40, 88, true, false), -swapRubberBand(40, 88));
  // Finger right: the previous candidate.
  assert.equal(swapDragOffset(40, 88, false, true), swapRubberBand(40, 88));
  assert.equal(swapDragOffset(40, 88, true, false), 40);
});

test('a release commits at half a stride or on a flick in the drag\'s direction, and only toward a neighbour', () => {
  const stride = 88;
  assert.equal(swapCommitDirection(-44, 0, stride, true, true), 1);
  assert.equal(swapCommitDirection(44, 0, stride, true, true), -1);
  assert.equal(swapCommitDirection(-43, 0, stride, true, true), 0);
  assert.equal(swapCommitDirection(-12, -SWAP_COMMIT_VELOCITY, stride, true, true), 1);
  assert.equal(swapCommitDirection(-12, -(SWAP_COMMIT_VELOCITY - 1), stride, true, true), 0);
  // A flick against the drag cancels even past half a stride.
  assert.equal(swapCommitDirection(-60, SWAP_COMMIT_VELOCITY, stride, true, true), 0);
  assert.equal(swapCommitDirection(-60, -900, stride, true, false), 0);
  assert.equal(swapCommitDirection(60, 900, stride, false, true), 0);
  assert.equal(swapCommitDirection(0, -900, stride, true, true), 0);
});

test('the outgoing piece leaves past the incoming one, which enters centred where the slot\'s piece stood', () => {
  assert.equal(swapExitOffset(1, -10, 88), -88);
  assert.equal(swapExitOffset(1, -80, 88), -(80 + 44));
  assert.equal(swapExitOffset(-1, 20, 88), 88);
  assert.deepEqual(swapEntryBox({ x: 10, y: 20, w: 100, h: 60 }, { x: 0, y: 0, w: 80, h: 40 }), { x: 20, y: 30, w: 80, h: 40 });
});

test('the marker follows the finger within a row and waits on its tile across a row break', () => {
  assert.deepEqual(swapMarkerPosition({ x: 52, y: 0 }, { x: 104, y: 0 }, 0.5), { x: 78, y: 0 });
  assert.deepEqual(swapMarkerPosition({ x: 312, y: 0 }, { x: 0, y: 52 }, 0.8), { x: 312, y: 0 });
  assert.deepEqual(swapMarkerPosition({ x: 52, y: 0 }, null, 0.8), { x: 52, y: 0 });
});

test('an enlarged board composes just narrow enough for the stage and the strip to fit the visible height', () => {
  // A 375 x 667 phone shows 554 points between its bars. Its tallest stage, 1.45 column widths
  // (497 points), with a three-row strip (44 + 8 + 148) and `spacing.md` above, between and
  // under them does not fit at full width.
  const panel = 44 + 8 + 3 * 44 + 2 * 8;
  const fit = swapStageFit(497, panel, 554);
  assert.ok(fit < 1);
  assert.ok(Math.abs(12 + 497 * fit + 12 + panel + 12 - 554) < 1e-9);
  // A stage that already fits keeps its width.
  assert.equal(swapStageFit(300, panel, 554), 1);
  // Never so narrow that the enlarged piece draws under its resting size: past that, the page scrolls.
  assert.equal(swapStageFit(900, panel, 554), 1 / SWAP_GROW_MIN);
  // Nothing measured yet: the board keeps its width.
  assert.equal(swapStageFit(0, panel, 554), 1);
  assert.equal(swapStageFit(497, panel, 0), 1);
});

// ADR 0026 section 3: the detail board overlaps like Today's, so a tap follows what the eye sees.
test('a tap on overlapping pieces names the one drawn on top, a name button names its own piece', () => {
  const pieces = [['primary_top', 'sweatshirt', 'top'], ['bottom', 'jeans', 'bottom'],
    ['outer_layer', 'rain_jacket', 'outerwear'], ['footwear', 'ankle_boots', 'footwear']]
    .map(([slot, type, category]) => ({ slot, ...resolveGarmentSilhouette(type, category) }));
  const width = 358;
  const result = composeGarmentBoard(pieces, detailPreset);
  const stack = result.stack.map((piece) => {
    const box = result.boxes.get(piece);
    return { slot: piece.slot, box: { x: box.x * width, y: box.y * width, w: box.w * width, h: box.h * width } };
  });
  const box = (slot) => stack.find((entry) => entry.slot === slot).box;
  // Where the waist lies over the top's hem, the bottom is on top; where the jacket lies over
  // the top's side, the jacket is.
  const top = box('primary_top');
  const bottom = box('bottom');
  const hem = { x: bottom.x + bottom.w / 2, y: (bottom.y + top.y + top.h) / 2 };
  assert.ok(hem.y > top.y && hem.y < top.y + top.h && hem.x > top.x && hem.x < top.x + top.w);
  assert.equal(swapHitSlot(stack, hem.x, hem.y, 44), 'bottom');
  const jacket = box('outer_layer');
  const side = { x: (jacket.x + top.x + top.w) / 2, y: jacket.y + jacket.h / 3 };
  assert.ok(side.x > top.x && side.x < top.x + top.w);
  assert.equal(swapHitSlot(stack, side.x, side.y, 44), 'outer_layer');
  // The footwear lies over the bottom's hem and wins there.
  const foot = box('footwear');
  assert.equal(swapHitSlot(stack, foot.x + foot.w / 2, foot.y + 1, 44), 'footwear');
  // Reversed, the order decides: the same point names the top.
  assert.equal(swapHitSlot([...stack].reverse(), hem.x, hem.y, 44), 'primary_top');
  // A name button under the board names its piece even where a padded box reaches it.
  const button = { x: 0, y: result.stageHeight * width + 8, w: 120, h: 44 };
  const named = stack.map((entry) => ({ ...entry, button: entry.slot === 'outer_layer' ? button : null }));
  assert.equal(swapHitSlot(named, 10, button.y + 10, 44), 'outer_layer');
  // Off every drawn box, the nearest padded touch box takes the tap; far away, nothing does.
  const small = [{ slot: 'a', box: { x: 0, y: 0, w: 20, h: 10 } }, { slot: 'b', box: { x: 100, y: 0, w: 20, h: 10 } }];
  assert.equal(swapHitSlot(small, 10, 20, 44), 'a');
  assert.equal(swapHitSlot(stack, 2, 2, 44), null);
});

test('Today and the detail stack their pieces in the same dressing order', () => {
  const pieces = [['primary_top', 'shirt', 'top'], ['bottom', 'trousers', 'bottom'], ['mid_layer', 'cardigan', 'top'],
    ['outer_layer', 'coat', 'outerwear'], ['footwear', 'closed_shoes', 'footwear']]
    .map(([slot, type, category]) => ({ slot, ...resolveGarmentSilhouette(type, category) }));
  assert.deepEqual(composeGarmentBoard(pieces, detailPreset).stack.map(({ slot }) => slot),
    composeGarmentBoard(pieces, todayPreset).stack.map(({ slot }) => slot));
});
