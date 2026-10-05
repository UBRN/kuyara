// The public site's garment boards, generated from the app's own code. GitHub Pages runs
// Jekyll and nothing else, so the boards are computed here and committed: the outfit rules
// (recommendOutfits, the deterministic path every install has), the board composition rule
// (ADR 0025), the colour drawings and their palette, and the plates of the theme.
//
// Run from the repository root:
//   node --experimental-strip-types --import ./apps/mobile/test/node-typescript-resolver.mjs \
//     apps/mobile/scripts/site-boards.mjs
// and commit what it writes. site-boards.test.mjs fails when the committed files drift from
// what this produces.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { recommendOutfits } from '@/features/recommendation/application/recommend-outfits';
import {
  accessoryOutfitSlots,
  assignedOutfitGarments,
} from '@/features/recommendation/domain/outfit-composition';
import { resolveAtmosphereState } from '@/features/today/domain/atmosphere-state';
import { catalogMessages } from '@/features/catalog/localization/catalog-messages';
import { recommendationMessages } from '@/features/recommendation/localization/recommendation-messages';
import { messages } from '@/localization/messages';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { garmentSilhouetteIds } from '@/components/ui/garment-board/garment-silhouette-map';
import {
  composeGarmentBoard,
  detailPreset,
  footwearPairDrawing,
  garmentShadowRule,
  todayPreset,
} from '@/components/ui/garment-board/compose-garment-board';
import { garmentLevelOfDetail, paintGarment } from '@/components/ui/garment-board/garment-paint';
import { resolveGarmentPalette } from '@/components/ui/garment-board/garment-palette';
import { darkTheme, lightTheme, plateTheme } from '@/theme/theme';
import { shiftOklchLightness } from '@/theme/color-oklch';

/** Board units: one stage is this many units wide, whatever width the page draws it at. */
export const STAGE_UNITS = 400;
const APPEARANCES = ['light', 'dark'];
const PREFERENCES = ['womens', 'mens'];
const THEMES = { light: lightTheme, dark: darkTheme };

/**
 * The sky choices the hero offers, each a real condition code. The plate is the app's own
 * atmosphere state for that condition by day; the particles take the condition's ink.
 */
export const SKIES = Object.freeze({
  clear: { code: 'clear', ink: 'clearDay', range: [-6, 34] },
  cloudy: { code: 'cloudy', ink: 'cloudy', range: [-6, 34] },
  rain: { code: 'rain', ink: 'rain', range: [0, 34] },
  snow: { code: 'snow', ink: 'snow', range: [-6, 2] },
});
export const TEMPERATURE_STEP = 2;

/**
 * The sample day the scroll story walks through, one board per moment. The evening moment is
 * after sunset, so its plate is the night plane and its palette the evening one.
 */
export const STORY = Object.freeze([
  { id: 'morning', hour: '08:00', sky: 'clear', code: 'clear', ink: 'clearDay', t: 18, night: false },
  { id: 'midday', hour: '12:00', sky: 'cloudy', code: 'cloudy', ink: 'cloudy', t: 10, night: false },
  { id: 'afternoon', hour: '16:00', sky: 'rain', code: 'rain', ink: 'rain', t: 12, night: false },
  { id: 'evening', hour: '21:00', sky: 'clear', code: 'clear', ink: 'clearNight', t: 4, night: true },
]);

/** The hero's opening state: what a visitor sees before touching anything. */
export const INITIAL = Object.freeze({ pref: 'womens', sky: 'cloudy', t: 14 });

const NOW = '2026-10-05T07:00:00.000Z';
const num = (value) => Math.round(value * 100) / 100;

function snapshot(temperatureC, code) {
  const wet = code === 'rain' || code === 'snow';
  const measurements = {
    temperatureCelsius: temperatureC,
    apparentTemperatureCelsius: temperatureC,
    condition: code,
    precipitationProbability: wet ? 0.85 : code === 'cloudy' ? 0.15 : 0,
    windSpeedMetersPerSecond: 3,
    humidity: wet ? 0.9 : 0.55,
    uvIndex: code === 'clear' && temperatureC > 18 ? 7 : 2,
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

function recommend(temperatureC, code, preference) {
  const result = recommendOutfits({
    snapshot: snapshot(temperatureC, code),
    now: NOW,
    clothingPreference: preference,
    dressStyle: 'casual',
    dayVariant: 0,
    dayKind: 'weekday',
  });
  if (result.status !== 'recommended' || result.outfits.length === 0) {
    throw new Error(`No outfit for ${preference} at ${temperatureC} C, ${code}.`);
  }
  return result.outfits;
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

function hash(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return value.toString(36);
}

/**
 * Each drawing is painted once per colour and stroke scale and shared by every board that
 * draws it. Clip path and gradient ids carry the `KU_` marker, which the page rewrites per
 * placed copy so two copies never share an id.
 */
function createArtBook() {
  const art = {};
  const paint = (silhouetteId, roles, ink, scale, pair) => {
    const quantized = Math.max(0.5, Math.round(scale * 2) / 2);
    const key = `a${hash(JSON.stringify([silhouetteId, roles, ink, quantized, pair]))}`;
    if (art[key] === undefined) {
      const silhouette = silhouettes[silhouetteId];
      if (pair) {
        const drawing = footwearPairDrawing(silhouette.bounds);
        art[key] = drawing.shoes.map(({ dx, dy }, index) =>
          `<g transform="translate(${num(dx)} ${num(dy)}) scale(${drawing.scale})">${serialize(paintGarment({
            silhouette, roles, ink, scale: quantized * drawing.scale, lod: 'full', uid: `KU_${key}${index}`,
          }))}</g>`).join('');
      } else {
        art[key] = serialize(paintGarment({
          silhouette, roles, ink, scale: quantized, lod: garmentLevelOfDetail(64 * quantized), uid: `KU_${key}`,
        }));
      }
    }
    return key;
  };
  return { art, paint };
}

// ------------------------------------------------------------------------------ boards

const BOARD_SLOTS = new Set(['primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear']);
const ACCESSORY_SIZE = 40;

function paletteOf(outfit, temperatureC, code, night) {
  return {
    optionId: outfit.optionId,
    formality: outfit.formality,
    temperatureC,
    condition: code,
    isNight: night,
    pieces: [
      ...assignedOutfitGarments(outfit).map(({ slot, garment }) => ({ slot, garmentTypeId: garment.garmentTypeId })),
      ...accessoryOutfitSlots.flatMap((slot) => {
        const accessory = outfit.accessories[slot];
        return accessory ? [{ slot, garmentTypeId: accessory.garment.garmentTypeId }] : [];
      }),
    ],
  };
}

/**
 * One board in both appearances. Inside a plate everything takes the light roles
 * (`plateTheme`), so the dark board paints on the dark plate with the light ink, exactly as
 * the app's `useGarmentRoles` does.
 */
function boardOf(book, outfit, { temperatureC, code, night, atmosphere, preset }) {
  const palette = paletteOf(outfit, temperatureC, code, night);
  const rolesByAppearance = Object.fromEntries(APPEARANCES.map((appearance) => {
    const plane = THEMES[appearance].atmosphere[atmosphere];
    const tile = THEMES[appearance].colors.garmentTile;
    const plate = plateTheme(THEMES[appearance], plane);
    const resolved = resolveGarmentPalette({
      ...palette,
      appearance: plate.colorScheme,
      stageColor: plane,
      accessoryStageColor: plateTheme(THEMES[appearance], tile).colors.background,
      inkColor: plate.colors.textPrimary,
    });
    return [appearance, { ink: plate.colors.textPrimary, bySlot: new Map(resolved.map((entry) => [entry.piece.slot, entry])) }];
  }));

  const pieces = palette.pieces.filter((piece) => BOARD_SLOTS.has(piece.slot)).map((piece) => {
    const silhouetteId = garmentSilhouetteIds[piece.garmentTypeId];
    if (silhouetteId === undefined) throw new Error(`No drawing for ${piece.garmentTypeId}.`);
    return { ...piece, silhouetteId, bounds: silhouettes[silhouetteId].bounds };
  });
  const composition = composeGarmentBoard(pieces, preset);
  const W = STAGE_UNITS;
  const drawn = composition.stack.map((piece) => {
    const box = composition.boxes.get(piece);
    const placed = { x: box.x * W, y: box.y * W, w: box.w * W, h: box.h * W };
    const scale = placed.w / piece.bounds.width;
    const art = APPEARANCES.map((appearance) => {
      const { ink, bySlot } = rolesByAppearance[appearance];
      return book.paint(piece.silhouetteId, bySlot.get(piece.slot).roles, ink, scale, Boolean(piece.single));
    });
    const light = rolesByAppearance.light.bySlot.get(piece.slot);
    return {
      slot: piece.slot,
      type: piece.garmentTypeId,
      family: light.colorFamily,
      art: art[0] === art[1] ? [art[0]] : art,
      // translate x, translate y, scale: the drawing's own units into board units.
      t: [num(placed.x - piece.bounds.x * scale), num(placed.y - piece.bounds.y * scale), num(scale)],
      box: [num(placed.x), num(placed.y), num(placed.w), num(placed.h)],
    };
  });
  const touches = palette.pieces.filter((piece) => !BOARD_SLOTS.has(piece.slot)).map((piece) => {
    const silhouetteId = garmentSilhouetteIds[piece.garmentTypeId];
    const { bounds } = silhouettes[silhouetteId];
    const scale = ACCESSORY_SIZE / Math.max(bounds.width, bounds.height);
    const art = APPEARANCES.map((appearance) => {
      const { ink, bySlot } = rolesByAppearance[appearance];
      return book.paint(silhouetteId, bySlot.get(piece.slot).roles, ink, scale, false);
    });
    return {
      slot: piece.slot,
      type: piece.garmentTypeId,
      family: rolesByAppearance.light.bySlot.get(piece.slot).colorFamily,
      art: art[0] === art[1] ? [art[0]] : art,
      t: [num(-bounds.x * scale + (ACCESSORY_SIZE - bounds.width * scale) / 2),
        num(-bounds.y * scale + (ACCESSORY_SIZE - bounds.height * scale) / 2), num(scale)],
    };
  });
  return { h: num(composition.stageHeight * W), pieces: drawn, touches };
}

// -------------------------------------------------------------------------- the output

function temperatures([low, high]) {
  const list = [];
  for (let value = low; value <= high; value += TEMPERATURE_STEP) list.push(value);
  return list;
}

function localizedNames() {
  return Object.fromEntries(['en', 'tr'].map((language) => {
    const catalog = catalogMessages[language];
    const names = {};
    const families = {};
    for (const [key, value] of Object.entries(catalog)) {
      let match = /^catalog\.garment_type\.([a-z_]+)\.name$/.exec(key);
      if (match) names[match[1]] = value;
      match = /^catalog\.color_family\.([a-z_]+)$/.exec(key);
      if (match) families[match[1]] = value;
    }
    const app = messages[language];
    return [language, {
      names,
      families,
      archetypes: recommendationMessages[language].archetypes,
      skies: Object.fromEntries(Object.entries(SKIES).map(([sky, { code }]) => [sky, app.weather.conditions[code]])),
      preferences: { womens: app.preferences.genderWoman, mens: app.preferences.genderMan },
      touches: app.today.finishingTouchesHeading,
    }];
  }));
}

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

/** One board as static SVG for a Jekyll include, so the first paint needs no script. */
function staticBoard(board, art, id, label) {
  const W = STAGE_UNITS;
  const layer = (piece, index) => {
    const markup = (key) => art[key].replace(/KU_/g, `${id}${index}_`);
    const [light, dark = light] = piece.art;
    const body = light === dark ? markup(light)
      : `<g class="ku-art-light">${markup(light)}</g><g class="ku-art-dark">${markup(dark)}</g>`;
    return `<svg class="ku-piece" viewBox="0 0 ${W} ${board.h}" data-slot="${piece.slot}" aria-hidden="true" focusable="false" style="z-index:${index + 1}"><g transform="translate(${piece.t[0]} ${piece.t[1]}) scale(${piece.t[2]})">${body}</g></svg>`;
  };
  return `<div class="ku-board" data-board="${id}" role="img" aria-label="${label}" style="--h:${board.h}">${board.pieces.map(layer).join('')}</div>\n`;
}

function outfitLabel(names, archetypeId, board) {
  const list = board.pieces.concat(board.touches)
    .map((piece) => `${names.names[piece.type]} (${names.families[piece.family].toLocaleLowerCase()})`).join(', ');
  return `${names.archetypes[archetypeId]}: ${list}`;
}

export function generateSiteBoards() {
  const book = createArtBook();
  const states = {};
  for (const preference of PREFERENCES) {
    for (const [sky, { code, range }] of Object.entries(SKIES)) {
      const atmosphere = resolveAtmosphereState(code, 'day');
      for (const temperatureC of temperatures(range)) {
        const outfits = recommend(temperatureC, code, preference);
        const context = { temperatureC, code, night: false, atmosphere };
        states[`${preference}|${sky}|${temperatureC}`] = {
          archetypes: outfits.map((outfit) => outfit.archetypeId),
          hero: boardOf(book, outfits[0], { ...context, preset: detailPreset }),
          options: outfits.map((outfit) => boardOf(book, outfit, { ...context, preset: todayPreset })),
        };
      }
    }
  }
  const story = Object.fromEntries(PREFERENCES.map((preference) => [preference, STORY.map((moment) => {
    const outfits = recommend(moment.t, moment.code, preference);
    const atmosphere = resolveAtmosphereState(moment.code, moment.night ? 'night' : 'day');
    return {
      id: moment.id,
      archetype: outfits[0].archetypeId,
      atmosphere,
      board: boardOf(book, outfits[0], {
        temperatureC: moment.t, code: moment.code, night: moment.night, atmosphere, preset: detailPreset,
      }),
    };
  })]));

  const i18n = localizedNames();
  const data = {
    units: STAGE_UNITS,
    initial: INITIAL,
    skies: Object.fromEntries(Object.entries(SKIES).map(([sky, { code, ink, range }]) => [sky, {
      atmosphere: resolveAtmosphereState(code, 'day'), ink, range,
    }])),
    step: TEMPERATURE_STEP,
    story: STORY.map(({ id, hour, sky, t, ink }) => ({ id, hour, sky, t, ink })),
    states,
    storyBoards: story,
    art: book.art,
    i18n,
  };

  const includes = {};
  const opening = states[`${INITIAL.pref}|${INITIAL.sky}|${INITIAL.t}`];
  for (const language of ['en', 'tr']) {
    includes[`board-hero-${language}.html`] = staticBoard(opening.hero, book.art, 'h',
      outfitLabel(i18n[language], opening.archetypes[0], opening.hero));
    opening.options.forEach((board, index) => {
      includes[`board-option-${index + 1}-${language}.html`] = staticBoard(board, book.art, `o${index + 1}`,
        outfitLabel(i18n[language], opening.archetypes[index], board));
    });
    story[INITIAL.pref].forEach((moment, index) => {
      includes[`board-story-${index + 1}-${language}.html`] = staticBoard(moment.board, book.art, `s${index + 1}`,
        outfitLabel(i18n[language], moment.archetype, moment.board));
    });
  }

  // What Jekyll prints around the static boards, so the first paint reads right without
  // script: the opening readout and the story's moments, for the opening catalogue.
  const byLanguage = (pick) => Object.fromEntries(['en', 'tr'].map((language) => [language, pick(i18n[language])]));
  const pageData = {
    initial: {
      t: INITIAL.t,
      sky: INITIAL.sky,
      atmosphere: data.skies[INITIAL.sky].atmosphere,
      range: SKIES[INITIAL.sky].range,
      condition: byLanguage((names) => names.skies[INITIAL.sky]),
      archetype: byLanguage((names) => names.archetypes[opening.archetypes[0]]),
      options: byLanguage((names) => opening.archetypes.map((id) => names.archetypes[id])),
      touches: byLanguage((names) => names.touches),
      skies: byLanguage((names) => names.skies),
      preferences: byLanguage((names) => names.preferences),
    },
    story: STORY.map((moment, index) => ({
      id: moment.id,
      hour: moment.hour,
      t: moment.t,
      ink: moment.ink,
      atmosphere: story[INITIAL.pref][index].atmosphere,
      condition: byLanguage((names) => names.skies[moment.sky]),
      archetype: byLanguage((names) => names.archetypes[story[INITIAL.pref][index].archetype]),
    })),
  };

  const files = {
    'docs/_data/site_boards.json': `${JSON.stringify(pageData, null, 2)}\n`,
    'docs/assets/data/boards.js':
      '/* Generated by apps/mobile/scripts/site-boards.mjs from the app\'s outfit rules, board composition rule and drawings. Do not edit. */\n'
      + `window.KU_BOARDS=${JSON.stringify(data)};\n`,
    'docs/assets/css/plates.css': plateCss(),
  };
  for (const [name, content] of Object.entries(includes)) {
    files[`docs/_includes/generated/${name}`] =
      `<!-- Generated by apps/mobile/scripts/site-boards.mjs. Do not edit. -->\n${content}`;
  }
  return { data, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('../../../', import.meta.url);
  const { files } = generateSiteBoards();
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(new URL(path, root), content);
    console.log(`${path} ${content.length} bytes`);
  }
}
