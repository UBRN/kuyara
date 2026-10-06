// The public site's garment boards, generated from the app's own code. GitHub Pages runs
// Jekyll and nothing else, so the boards are computed here and committed: one women's and one
// men's board for each weather scene, each a valid outfit of the app's rules for that scene's
// weather, laid out by the board composition rule (ADR 0025) in the colour drawings of that
// catalogue's cut and their palette, on the plates of the theme.
//
// Run from the repository root:
//   node --experimental-strip-types --import ./apps/mobile/test/node-typescript-resolver.mjs \
//     apps/mobile/scripts/site-boards.mjs
// and commit what it writes. site-boards.test.mjs fails when the committed files drift from
// what this produces.
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { collectValidOutfits } from '@/features/recommendation/domain/outfit-composition';
import { assignedOutfitGarments, garmentIdSet } from '@/features/recommendation/domain/outfit-model';
import { eligibilityCandidates, outfitOptionId } from '@/features/recommendation/application/recommend-outfits';
import { resolveAtmosphereState } from '@/features/weather/domain/atmosphere-state';
import { catalogMessages } from '@/features/catalog/localization/catalog-messages';
import { messages } from '@/localization/messages';
import { silhouettes } from '@/garment-art/silhouettes';
import { garmentSilhouetteIdFor } from '@/garment-art/garment-silhouette-map';
import {
  drawnExtent,
  footwearPairDrawing,
  garmentShadowOf,
  garmentBoardDressingOrder,
  garmentShadowRule,
  todayPreset,
} from '@/garment-art/compose-garment-board';
import { composeFlatLay } from '@/garment-art/compose-flat-lay';
import { garmentLevelOfDetail, paintGarment } from '@/garment-art/garment-paint';
import { resolveGarmentPalette } from '@/garment-art/garment-palette';
import { darkTheme, lightTheme, plateTheme } from '@/theme/theme';
import { shiftOklchLightness } from '@/theme/color-oklch';

/** Board units: a composed stage is this many units wide. */
export const STAGE_UNITS = 400;
export const PREFERENCES = ['womens', 'mens'];
const APPEARANCES = ['light', 'dark'];
const THEMES = { light: lightTheme, dark: darkTheme };
const LANGUAGES = ['en', 'tr'];

/**
 * The page's weather scenes, warm to cold, and what each catalogue wears in them. Every outfit
 * has to be one the app's rules compose for that weather, or the generator stops. `particles`
 * is the plate's moving weather and `ink` the condition colour it is drawn in.
 *
 * The app's palette colours every board, and two boards side by side or one scene apart should
 * not wear the same colours. `palette` is added to the outfit's option id, the seed the palette
 * chooses colours from. Where the palette leaves a piece only one colour whatever the seed,
 * `recorded` gives that piece a colour from its own colourway the way a Closet record does, and
 * the palette colours the rest around it.
 */
export const SCENES = Object.freeze([
  {
    id: 'hot', temperatureC: 31, condition: 'clear', particles: 'motes', ink: 'clearDay',
    womens: ['t_shirt', 'skirt', 'sandals'],
    mens: ['t_shirt', 'shorts', 'sandals'],
    palette: { womens: 0, mens: 0 },
  },
  {
    id: 'mild', temperatureC: 17, condition: 'partly_cloudy', particles: 'clouds', ink: 'cloudy',
    womens: ['long_sleeve_t_shirt', 'jeans', 'light_jacket', 'sneakers'],
    mens: ['long_sleeve_t_shirt', 'jeans', 'light_jacket', 'sneakers'],
    palette: { womens: 1, mens: 0 },
    recorded: { womens: { primary_top: 'ecru' } },
  },
  {
    id: 'rain', temperatureC: 11, condition: 'rain', particles: 'rain', ink: 'rain',
    womens: ['sweater', 'long_skirt', 'rain_jacket', 'rain_boots'],
    mens: ['sweater', 'jeans', 'rain_jacket', 'rain_boots'],
    palette: { womens: 3, mens: 5 },
  },
  {
    id: 'wind', temperatureC: 7, condition: 'cloudy', windMetersPerSecond: 10, particles: 'wind', ink: 'cloudy',
    womens: ['turtleneck', 'trousers', 'coat', 'ankle_boots'],
    mens: ['turtleneck', 'jeans', 'insulated_jacket', 'ankle_boots'],
    palette: { womens: 0, mens: 0 },
    recorded: { mens: { primary_top: 'camel' } },
  },
  {
    id: 'snow', temperatureC: -3, condition: 'snow', particles: 'snow', ink: 'snow',
    womens: ['sweater', 'jeans', 'parka', 'weather_boots'],
    mens: ['sweater', 'jeans', 'parka', 'weather_boots'],
    palette: { womens: 13, mens: 5 },
  },
]);

/** The board beside the hero on a wide screen: one scene's look, drawn again with its own ids. */
export const HERO = Object.freeze({ scene: 'mild', preference: 'womens' });

const NOW = '2026-10-05T07:00:00.000Z';
const num = (value) => Math.round(value * 100) / 100;

function snapshot({ temperatureC, condition, windMetersPerSecond = 3 }) {
  const wet = condition === 'rain' || condition === 'snow';
  const measurements = {
    temperatureCelsius: temperatureC,
    apparentTemperatureCelsius: temperatureC,
    condition,
    precipitationProbability: wet ? 0.85 : condition === 'clear' ? 0 : 0.15,
    windSpeedMetersPerSecond: windMetersPerSecond,
    humidity: wet ? 0.9 : 0.55,
    uvIndex: condition === 'clear' && temperatureC > 18 ? 7 : 2,
  };
  return {
    id: 'site-sample',
    localProfileId: 'site-sample',
    locationKey: 'manual:sample.site',
    timeZone: 'UTC',
    fetchedAt: NOW,
    origin: { kind: 'sample', sourceId: 'site-boards' },
    current: { observedAt: NOW, ...measurements },
    minimumTemperatureCelsius: temperatureC - 3,
    maximumTemperatureCelsius: temperatureC + 3,
    hourly: Array.from({ length: 14 }, (_, hour) => ({
      forecastAt: new Date(Date.parse(NOW) + hour * 3_600_000).toISOString(),
      ...measurements,
    })),
  };
}

/** The scene's outfit as the app's rules compose it, or an error naming what does not fit. */
function validOutfit(scene, preference) {
  const requirements = deriveClothingRequirements(snapshot(scene), NOW);
  const result = collectValidOutfits(requirements, eligibilityCandidates(requirements, preference));
  const wanted = [...new Set(scene[preference])].sort().join('|');
  const outfit = result.status === 'composed'
    ? result.outfits.find((candidate) => garmentIdSet(candidate) === wanted)
    : undefined;
  if (!outfit) throw new Error(`${scene.id} ${preference}: ${scene[preference].join(' + ')} is not a valid outfit for that weather.`);
  return outfit;
}

// ---------------------------------------------------------------------------- painting

const TAG = {
  G: 'g', Defs: 'defs', ClipPath: 'clipPath', Path: 'path', Rect: 'rect',
  LinearGradient: 'linearGradient', RadialGradient: 'radialGradient', Stop: 'stop',
};
const KEEP_CAMEL = new Set(['gradientUnits', 'gradientTransform', 'clipPathUnits', 'viewBox', 'fx', 'fy']);
const attrName = (key) => (KEEP_CAMEL.has(key) ? key
  : key === 'clipPath' ? 'clip-path' : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
const attrValue = (value) => (typeof value === 'number' ? String(num(value))
  : Array.isArray(value) ? value.map(attrValue).join(' ') : String(value));

function serialize(node) {
  const tag = TAG[node.tag];
  const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${attrName(key)}="${attrValue(value)}"`).join('');
  const children = (node.children ?? []).map(serialize).join('');
  return children ? `<${tag}${attrs}>${children}</${tag}>` : `<${tag}${attrs}/>`;
}

/** One piece in its own drawing units; footwear as the board's pair. */
function paintPiece(silhouette, roles, ink, scale, pair, uid) {
  if (!pair) {
    return serialize(paintGarment({ silhouette, roles, ink, scale, lod: garmentLevelOfDetail(64 * scale), uid }));
  }
  const drawing = footwearPairDrawing(silhouette.bounds);
  return drawing.shoes.map(({ dx, dy }, index) =>
    `<g transform="translate(${num(dx)} ${num(dy)}) scale(${drawing.scale})">${serialize(paintGarment({
      silhouette, roles, ink, scale: scale * drawing.scale, lod: 'full', uid: `${uid}s${index}`,
    }))}</g>`).join('');
}

// ------------------------------------------------------------------------------ boards

/** A type's drawing in a catalogue's cut, as the app's boards draw it for that profile. */
function drawingOf(typeId, preference) {
  const id = garmentSilhouetteIdFor(typeId, preference);
  if (id === undefined) throw new Error(`No drawing for ${typeId}.`);
  return { id, silhouette: silhouettes[id] };
}

/**
 * One board, both appearances. Inside a plate everything takes the light roles
 * (`plateTheme`), so the dark board paints on the dark plate with the light ink, exactly as
 * the app's `useGarmentRoles` does. Lengths are board units: a stage is STAGE_UNITS wide.
 */
function boardOf(scene, preference, idPrefix = scene.id) {
  const outfit = validOutfit(scene, preference);
  const atmosphere = resolveAtmosphereState(scene.condition, 'day');
  const pieces = assignedOutfitGarments(outfit).map(({ slot, garment }) => {
    const { id, silhouette } = drawingOf(garment.garmentTypeId, preference);
    return { slot, garmentTypeId: garment.garmentTypeId, silhouetteId: id, silhouette, bounds: silhouette.bounds, groups: silhouette.groups };
  });
  const palette = {
    optionId: scene.palette[preference] ? `${outfitOptionId(outfit)}:${scene.palette[preference]}` : outfitOptionId(outfit),
    formality: outfit.formality,
    temperatureC: scene.temperatureC,
    condition: scene.condition,
    isNight: false,
    pieces: pieces.map(({ slot, garmentTypeId }) => {
      const recordedSwatchId = scene.recorded?.[preference]?.[slot];
      return recordedSwatchId === undefined ? { slot, garmentTypeId } : { slot, garmentTypeId, recordedSwatchId };
    }),
  };
  const colours = Object.fromEntries(APPEARANCES.map((appearance) => {
    const plane = THEMES[appearance].atmosphere[atmosphere];
    const plate = plateTheme(THEMES[appearance], plane);
    const resolved = resolveGarmentPalette({
      ...palette, appearance: plate.colorScheme, stageColor: plane, inkColor: plate.colors.textPrimary,
    });
    return [appearance, { ink: plate.colors.textPrimary, bySlot: new Map(resolved.map((entry) => [entry.piece.slot, entry])) }];
  }));

  const composition = composeFlatLay(pieces, todayPreset);
  const W = STAGE_UNITS;
  const drawn = composition.stack.map((piece, index) => {
    const box = composition.boxes.get(piece);
    const placed = { x: box.x * W, y: box.y * W, w: box.w * W, h: box.h * W };
    const scale = placed.w / piece.bounds.width;
    const paint = (appearance, uid) => {
      const { ink, bySlot } = colours[appearance];
      return paintPiece(piece.silhouette, bySlot.get(piece.slot).roles, ink, scale, Boolean(piece.single), uid);
    };
    const uid = `${idPrefix}${preference[0]}${index}`;
    const light = paint('light', uid);
    return {
      slot: piece.slot,
      type: piece.garmentTypeId,
      drawing: piece.silhouetteId,
      family: colours.light.bySlot.get(piece.slot).colorFamily,
      swatch: colours.light.bySlot.get(piece.slot).swatchId,
      // The dark plate's colours only when they differ from the light plate's.
      art: paint('dark', uid) === light ? [light] : [light, paint('dark', `${uid}d`)],
      t: [num(placed.x - piece.bounds.x * scale), num(placed.y - piece.bounds.y * scale), num(scale)],
      box: [num(placed.x), num(placed.y), num(placed.w), num(placed.h)],
    };
  });
  return { atmosphere, pieces: drawn };
}

// -------------------------------------------------------------------------- the output

/** The plate, shadow and particle colours, both appearances, as CSS custom properties. */
function plateCss() {
  const states = ['neutral', 'clearDay', 'veiledDay', 'fallingDay', 'clearNight', 'veiledNight', 'fallingNight'];
  const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const block = (appearance) => {
    const theme = THEMES[appearance];
    const lines = [];
    for (const state of states) {
      const plane = theme.atmosphere[state];
      lines.push(`  --ku-plate-${kebab(state)}: ${plane};`);
      // Every board stands on a light plate, in both appearances, so every shadow takes the
      // light step (garment-board.md section 9).
      lines.push(`  --ku-plate-shadow-${kebab(state)}: ${shiftOklchLightness(plane, garmentShadowRule.step.light)};`);
    }
    lines.push(`  --ku-garment-tile: ${theme.colors.garmentTile};`);
    lines.push(`  --ku-garment-ground: ${theme.colors.garmentGround};`);
    lines.push(`  --ku-plate-text: ${plateTheme(theme, theme.atmosphere.neutral).colors.textPrimary};`);
    lines.push(`  --ku-plate-text-secondary: ${plateTheme(theme, theme.atmosphere.neutral).colors.textSecondary};`);
    return lines.join('\n');
  };
  // Particles stand on the plate, which is light in both appearances, so they take the
  // light condition inks in both.
  const inks = ['clearDay', 'clearNight', 'cloudy', 'rain', 'snow']
    .map((role) => `  --ku-particle-${kebab(role)}: ${lightTheme.condition[role]};`).join('\n');
  return [
    '/*',
    ' * Generated by apps/mobile/scripts/site-boards.mjs from apps/mobile/src/theme/theme.ts.',
    ' * Do not edit: change the theme and run the generator. The plates are the app\'s',
    ' * atmosphere planes; in dark each is its light grey plate (darkPlateOf), never the page.',
    ' */',
    ':root {',
    block('light'),
    inks,
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    block('dark').replace(/^/gm, '  '),
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    block('dark'),
    '}',
    '',
  ].join('\n');
}

/** Every plate on the page has one shape, a portrait tile, whatever its outfit. */
const TILE_ASPECT = 4 / 5;

/**
 * Both boards of a scene share one frame: the larger of their drawn extents, with room for the
 * piece shadow, widened or deepened to the tile's shape, each board centred in it. So the two
 * draw at one scale, side by side.
 */
function sceneFrame(boards) {
  const extents = boards.map((board) => drawnExtent(board.pieces.map(({ box: [x, y, w, h] }) => ({ x, y, w, h }))));
  const margin = garmentShadowOf(STAGE_UNITS).margin + 0.04 * STAGE_UNITS;
  let w = Math.max(...extents.map((extent) => extent.w)) + 2 * margin;
  let h = Math.max(...extents.map((extent) => extent.h)) + 2 * margin;
  if (w / h < TILE_ASPECT) w = h * TILE_ASPECT; else h = w / TILE_ASPECT;
  return extents.map((extent) => [num(extent.x - (w - extent.w) / 2), num(extent.y - (h - extent.h) / 2), num(w), num(h)]);
}

/** A board's pieces in the order they are put on: how the page names them and lands them. */
const dressed = (board) => [...board.pieces]
  .sort((a, b) => garmentBoardDressingOrder.indexOf(a.slot) - garmentBoardDressingOrder.indexOf(b.slot));

/**
 * One board as static SVG for a Jekyll include. The page passes its accessible name, so one
 * file serves both languages. The pieces are drawn back to front and each lands on its own
 * when its scene arrives, `--i` being its place in the dressing order.
 */
function staticBoard(board, viewBox) {
  const k = num(STAGE_UNITS / viewBox[2]);
  const order = dressed(board);
  const layer = (piece) => {
    const [light, dark] = piece.art;
    const body = dark === undefined ? light
      : `<g class="ku-art-light">${light}</g><g class="ku-art-dark">${dark}</g>`;
    return `<g class="ku-piece" data-slot="${piece.slot}" style="--i:${order.indexOf(piece)}"><g transform="translate(${piece.t[0]} ${piece.t[1]}) scale(${piece.t[2]})">${body}</g></g>`;
  };
  return `<svg class="ku-board" viewBox="${viewBox.join(' ')}" role="img" aria-label="{{ include.label | escape }}" style="--k:${k}">${board.pieces.map(layer).join('')}</svg>\n`;
}

function localized(language) {
  const catalog = catalogMessages[language];
  return {
    name: (type) => catalog[`catalog.garment_type.${type}.name`],
    family: (family) => catalog[`catalog.color_family.${family}`],
    condition: (code) => messages[language].weather.conditions[code],
  };
}

const signed = (t) => `${t < 0 ? '−' : ''}${Math.abs(t)}°`;

export function generateSiteBoards() {
  const words = Object.fromEntries(LANGUAGES.map((language) => [language, localized(language)]));
  const byLanguage = (pick) => Object.fromEntries(LANGUAGES.map((language) => [language, pick(words[language], language)]));

  const scenes = SCENES.map((scene) => {
    const boards = PREFERENCES.map((preference) => boardOf(scene, preference));
    return { scene, boards, frames: sceneFrame(boards) };
  });

  const heroScene = SCENES.find((scene) => scene.id === HERO.scene);
  const hero = boardOf(heroScene, HERO.preference, 'hero');
  const labelOf = (board) => byLanguage((names, language) => dressed(board)
    .map((piece) => `${names.name(piece.type)} (${names.family(piece.family).toLocaleLowerCase(language)})`).join(', '));

  const pageData = {
    hero: { atmosphere: hero.atmosphere, label: labelOf(hero) },
    scenes: scenes.map(({ scene, boards }) => ({
      id: scene.id,
      temperature: signed(scene.temperatureC),
      atmosphere: boards[0].atmosphere,
      particles: scene.particles,
      ink: scene.ink,
      condition: byLanguage((names) => names.condition(scene.condition)),
      looks: PREFERENCES.map((preference, index) => ({
        preference,
        pieces: byLanguage((names) => dressed(boards[index]).map((piece) => names.name(piece.type))),
        label: labelOf(boards[index]),
      })),
    })),
  };

  const files = {
    'docs/_data/site_boards.json': `${JSON.stringify(pageData, null, 2)}\n`,
    'docs/assets/css/plates.css': plateCss(),
    'docs/_includes/generated/hero.html':
      `<!-- Generated by apps/mobile/scripts/site-boards.mjs. Do not edit. -->\n${staticBoard(hero, sceneFrame([hero])[0])}`,
  };
  for (const { scene, boards, frames } of scenes) {
    boards.forEach((board, index) => {
      files[`docs/_includes/generated/scene-${scene.id}-${PREFERENCES[index]}.html`] =
        `<!-- Generated by apps/mobile/scripts/site-boards.mjs. Do not edit. -->\n${staticBoard(board, frames[index])}`;
    });
  }
  return { scenes: scenes.map(({ scene, boards }) => ({ id: scene.id, boards })), files };
}

export const GENERATED_INCLUDES = 'docs/_includes/generated/';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('../../../', import.meta.url);
  const { files } = generateSiteBoards();
  // The generated includes are this script's alone: anything it no longer writes goes.
  const includes = new URL(GENERATED_INCLUDES, root);
  for (const name of readdirSync(includes)) {
    if (!(`${GENERATED_INCLUDES}${name}` in files)) rmSync(new URL(name, includes));
  }
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(new URL(path, root), content);
    console.log(`${path} ${content.length} bytes`);
  }
}
