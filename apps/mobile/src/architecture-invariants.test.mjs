// AGENTS.md states several import boundaries as greppable `rg` invariants. This file is the
// automated guard for them: it walks `apps/mobile/src` itself instead of shelling out, so the
// rules hold in CI without depending on ripgrep being installed.
//
// Scope note: every literal specifier is inspected: `import ... from '<spec>'`,
// `export ... from '<spec>'`, side-effect `import '<spec>'`, `require('<spec>')`, and
// `import('<spec>')` in both its forms, the dynamic `await import('<spec>')` and the type-level
// `typeof import('<spec>')`. A type-only reference counts: `import type { X } from '<spec>'`
// already does, the `rg` invariants in AGENTS.md match the text either way, and the adapters
// name their SDK through `typeof import(...)` today. Test files (`*.test.*`, which also covers
// `*.component.test.*`) are skipped for every rule: component tests legitimately call
// `jest.mock('@expo/ui/...')` and friends, and AGENTS.md itself writes the Observe check as
// `--glob '!*.test.*'`. Non-test helpers under `__tests__/` stay in scope, exactly as they do
// for those `rg` commands; a shared mock of a guarded package belongs next to the wrapper it
// stands in for (`components/ui/__tests__/expo-ui-test-mock.tsx`), not under a feature.
// The sixth rule (cross-feature imports) is the only one that exempts `import type` statements, and
// its allowlist of pre-existing violations only shrinks: a stale entry fails the test.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = import.meta.dirname;
const repoRelativeRoot = 'apps/mobile/src';

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const skippedDirectories = new Set(['node_modules', '.expo', '.expo-shared', 'dist', 'build']);

/** Every non-test source file under `src`, as paths relative to `src` in posix form. */
function sourceFiles(directory = sourceRoot, relative = '') {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      found.push(...sourceFiles(path.join(directory, entry.name), entryRelative));
      continue;
    }

    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) {
      continue;
    }
    if (entry.name.includes('.test.')) {
      continue;
    }

    found.push(entryRelative);
  }

  return found;
}

const specifierPatterns = [
  // `import x from '…'`, `import type { x } from '…'`, `export { x } from '…'`
  /\bfrom\s*['"]([^'"]+)['"]/g,
  // side-effect `import '…'`
  /\bimport\s*['"]([^'"]+)['"]/g,
  // dynamic `import('…')` and type-level `typeof import('…')`
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Literal import specifiers in one file, with the 1-based line they appear on. */
function specifiersIn(relativePath) {
  const lines = readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n');
  const found = [];

  lines.forEach((line, index) => {
    for (const pattern of specifierPatterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(line);
      while (match !== null) {
        found.push({ specifier: match[1], line: index + 1 });
        match = pattern.exec(line);
      }
    }
  });

  return found;
}

/** Matches a package specifier and its subpaths (`@expo/ui` and `@expo/ui/swift-ui`). */
const packageMatcher = (packageName) => (specifier) =>
  specifier === packageName || specifier.startsWith(`${packageName}/`);

/** Matches a workspace-local module by path tail, however it is reached relatively. */
const modulePathMatcher = (moduleTail) => (specifier) =>
  specifier.endsWith(moduleTail) || specifier.includes(`${moduleTail}/`);

const inDirectory = (relativePath, directory) => relativePath.startsWith(directory);

const rules = [
  {
    name: 'components/ui is the only importer of @expo/ui and expo-haptics',
    matches: (specifier) => packageMatcher('@expo/ui')(specifier) || packageMatcher('expo-haptics')(specifier),
    forbiddenDirectories: ['features/'],
    allowedDirectories: null,
    ruleText:
      'AGENTS.md, "UI and visual identity": "Feature code never imports `@expo/ui` or `expo-haptics`. '
      + '`components/ui` wraps both and is the only importer; `rg \"@expo/ui|expo-haptics\" '
      + 'apps/mobile/src/features` must return nothing." Native controls are wrapped once so the '
      + 'control layer stays replaceable (ADR 0019). Wrap the control in `components/ui` and import '
      + 'that wrapper from the feature instead.',
  },
  {
    name: 'the Foundation Models module has exactly one importer',
    matches: modulePathMatcher('modules/kuyara-on-device-ai'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/recommendation/data/'],
    ruleText:
      'AGENTS.md, "UI and visual identity": "The local Foundation Models Expo module has exactly one '
      + 'importer. `rg \"modules/kuyara-on-device-ai\" apps/mobile/src` must return only files under '
      + '`apps/mobile/src/features/recommendation/data/`" (ADR 0034). Feature code never imports the '
      + 'native module; it goes through the recommendation data adapter.',
  },
  {
    name: 'expo-observe has a single PerformanceTelemetry adapter',
    matches: packageMatcher('expo-observe'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/analytics/data/'],
    ruleText:
      'AGENTS.md, "Product and scope": EAS Observe "reaches Observe only through the project-owned '
      + '`PerformanceTelemetry` boundary; `rg \"expo-observe\" apps/mobile/src --glob \'!*.test.*\'` '
      + 'must return only its single adapter." (ADR 0033 section 7). Observe is observability, not '
      + 'product analytics: route the call through the adapter under features/analytics/data/.',
  },
  {
    name: 'posthog-react-native has a single ProductAnalytics adapter',
    matches: packageMatcher('posthog-react-native'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/analytics/data/'],
    ruleText:
      'AGENTS.md, "Product and scope": analytics "reaches PostHog only through the project-owned '
      + '`ProductAnalytics` boundary and the reviewed event taxonomy; do not add provider SDK calls '
      + 'in features or emit events outside an approved task." (ADR 0023). Emit through the '
      + 'ProductAnalytics boundary under features/analytics/data/, never the provider SDK.',
  },
  {
    name: 'expo-sqlite is opened in one place under infrastructure/sqlite',
    matches: packageMatcher('expo-sqlite'),
    forbiddenDirectories: null,
    allowedDirectories: ['infrastructure/sqlite/'],
    ruleText:
      'AGENTS.md, "Architecture boundaries": "UI and domain code must not import SQLite, Supabase, '
      + 'Firebase, WeatherKit, Cloudflare, or provider-specific SDKs directly", and "Local data and '
      + 'future-sync rules": "Access SQLite only through repository interfaces and local data '
      + 'sources." AGENTS.md alone would also read as permitting a feature\'s local data source to '
      + 'import the SDK; docs/architecture.md pins the narrower reading: "Only the infrastructure '
      + 'adapter imports `expo-sqlite`." The SDK is opened once in infrastructure/sqlite/ and '
      + 'everything else takes the `SqliteDatabase` handle from there. Widening this allowance is '
      + 'an architecture decision to record in docs/architecture.md first, not a test fix.',
  },
  {
    name: 'the garment fill tables and the accent resolver stay behind the board renderer',
    matches: (specifier) =>
      modulePathMatcher('garment-board/garment-render-fills')(specifier)
      || modulePathMatcher('garment-board/garment-palette')(specifier)
      || modulePathMatcher('garment-board/color-family-fill')(specifier),
    forbiddenDirectories: null,
    allowedDirectories: ['components/ui/garment-board/', 'components/ui/index.ts'],
    ruleText:
      'docs/design/design-system.md, "Implemented and deferred": the colour-family fills are '
      + '"approved content colour for the rack and grid only (ADR 0028 section 6 and ADR 0029 '
      + 'section 5), not semantic theme roles", and the Phase 6 swatch library is content colour '
      + 'too. The resolvers that turn an outfit and a plane into fills are the board renderer\'s '
      + 'own business: they stay under components/ui/garment-board/, and a '
      + 'feature that needs an approved content colour takes `colorFamilyFills` from the '
      + '`components/ui` barrel instead of reaching into the module.',
  },
];

const violationsFor = (rule) => {
  const violations = [];

  for (const relativePath of sourceFiles()) {
    const allowed = rule.allowedDirectories === null
      ? !rule.forbiddenDirectories.some((directory) => inDirectory(relativePath, directory))
      : rule.allowedDirectories.some((directory) => inDirectory(relativePath, directory));

    if (allowed) {
      continue;
    }

    for (const { specifier, line } of specifiersIn(relativePath)) {
      if (rule.matches(specifier)) {
        violations.push(`${repoRelativeRoot}/${relativePath}:${line} imports '${specifier}'`);
      }
    }
  }

  return violations;
};

for (const rule of rules) {
  test(rule.name, () => {
    const violations = violationsFor(rule);

    assert.deepEqual(
      violations,
      [],
      `${rule.ruleText}\n\nThese imports break that rule:\n${violations.map((line) => `  - ${line}`).join('\n')}`,
    );
  });
}

// docs/design/design-language.md, Law 4 (O15): every board draws its outfit in that outfit's
// own palette, the alternates included, so an outfit looks the same wherever it appears. The
// Closet and the Profile rack draw personal records and never take a board or its palette.
// Onboarding's welcome step (O14) is the one other board: a fixed sample of what Today
// shows, drawn in its own palette like any outfit.
const boardFiles = ['features/today/presentation/', 'features/profile/presentation/onboarding-screen.tsx'];
test('every garment board carries its outfit palette and only Today draws one', () => {
  const boards = sourceFiles().flatMap((relativePath) => (
    [...readFileSync(path.join(sourceRoot, relativePath), 'utf8').matchAll(/<GarmentBoard\b[\s\S]*?\/>/g)]
      .map(([element]) => ({ relativePath, element }))
  ));

  assert.ok(boards.length > 0);
  assert.deepEqual(
    boards.filter(({ relativePath, element }) => (
      !boardFiles.some((prefix) => relativePath.startsWith(prefix)) || !element.includes('palette=')
    )).map(({ relativePath }) => relativePath),
    [],
    'A board draws a recommended outfit in its palette (O15, design-language.md Law 4). Pass the '
    + 'outfit\'s `palette`, or draw a personal record with `GarmentTileArtwork` instead.',
  );
});

/** Line numbers of the `from '…'` clauses that belong to an `import type …` statement. */
function typeOnlyImportLines(relativePath) {
  const source = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
  const lines = new Set();
  for (const match of source.matchAll(/^[ \t]*import\s+type\b[^;]*?\bfrom\s*['"][^'"]+['"]/gm)) {
    lines.add(source.slice(0, match.index + match[0].length).split('\n').length);
  }
  return lines;
}

/** `features/<name>/<layer>/…` for a specifier resolved from the importing file, else null. */
function featureModuleOf(relativePath, specifier) {
  const resolved = specifier.startsWith('@/')
    ? specifier.slice(2)
    : specifier.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier))
      : null;
  const match = resolved?.match(/^features\/([^/]+)\/([^/]+)\//);
  return match ? { feature: match[1], layer: match[2], module: resolved } : null;
}

const featureOf = (relativePath) => relativePath.match(/^features\/([^/]+)\//)?.[1] ?? null;

// Each entry is one runtime import that AGENTS.md line 49 forbids and that predates the rule.
// Remove the entry when its fix lands; a stale entry fails the test.
const crossFeatureInternalImportAllowlist = [
  // Background task composes the profile repository by hand; export a loadProfileRepository() from profile/application.
  ['features/notifications/data/expo-background-weather-alert-task.ts', 'features/profile/data/profile-repository'],
  // Same composition; goes away with the factory above.
  ['features/notifications/data/expo-background-weather-alert-task.ts', 'features/profile/data/sqlite-profile-local-data-source'],
  // Background task duplicates weather/application's unexported loadRepository(); export and reuse it.
  ['features/notifications/data/expo-background-weather-alert-task.ts', 'features/weather/data/weather-repository'],
  // Same composition; goes away with the weather factory.
  ['features/notifications/data/expo-background-weather-alert-task.ts', 'features/weather/data/sqlite-weather-local-data-source'],
  // Onboarding renders weather's location controls; pass them in from app/onboarding.tsx as a slot.
  ['features/profile/presentation/onboarding-screen.tsx', 'features/weather/presentation/location-selection-controls'],
  // Today shows the weather provider attribution; slot it from app/(tabs)/(today)/index.tsx or move the component.
  // WeatherGlyph depends on theme only and is misfiled under today/; move it to components/ui.
  ['features/weather/presentation/weather-screen.tsx', 'features/today/presentation/weather-glyph'],
].map(([importer, module]) => `${importer} -> ${module}`);

test('a feature reaches another feature only through its domain or application layer', () => {
  const ruleText =
    'AGENTS.md, "Architecture boundaries": "A feature reaches another feature only through that '
    + 'feature\'s domain or application layer; an `import type` of an interface is the one exception. '
    + 'Composition code (the route files under `app/`, each feature\'s application provider, and the '
    + 'background task entry) may import a feature\'s data and presentation modules; feature code may '
    + 'not." Reach the other feature through its application context, hook or exported factory, move a '
    + 'shared primitive to components/ui, or wire the pieces together in the route file.';
  const seen = new Set();
  const violations = [];

  for (const relativePath of sourceFiles()) {
    const importer = featureOf(relativePath);
    if (importer === null) continue;
    const typeOnly = typeOnlyImportLines(relativePath);

    for (const { specifier, line } of specifiersIn(relativePath)) {
      const target = featureModuleOf(relativePath, specifier);
      if (target === null || target.feature === importer) continue;
      if (target.layer !== 'data' && target.layer !== 'presentation') continue;
      if (typeOnly.has(line)) continue;

      const key = `${relativePath} -> ${target.module}`;
      if (crossFeatureInternalImportAllowlist.includes(key)) {
        seen.add(key);
        continue;
      }
      violations.push(`${repoRelativeRoot}/${relativePath}:${line} imports '${specifier}'`);
    }
  }

  assert.deepEqual(violations, [], `${ruleText}\n\nThese imports break that rule:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
  const stale = crossFeatureInternalImportAllowlist.filter((key) => !seen.has(key));
  assert.deepEqual(stale, [], `These allowlist entries no longer match an import; remove them so the list only shrinks:\n${stale.map((v) => `  - ${v}`).join('\n')}`);
});

test('the walker actually reads the tree it is asked to guard', () => {
  // A silent empty walk would make every rule above pass vacuously.
  const files = sourceFiles();
  assert.ok(files.length > 100, `expected the source tree under ${repoRelativeRoot}, found ${files.length} files`);
  assert.ok(files.some((file) => file.includes('.test.')) === false, 'test files must be excluded');
  assert.ok(
    specifiersIn('features/analytics/data/posthog-product-analytics.ts')
      .some(({ specifier }) => specifier === 'posthog-react-native'),
    'the specifier reader must find the PostHog adapter\'s own import',
  );
});

test('the specifier reader sees `typeof import(…)`, the form the adapters name their SDK through', () => {
  // The Observe adapter refers to its SDK type-only via `typeof import('expo-observe')`. Locate
  // that line from the file itself so the check does not rot when the file moves around.
  const relativePath = 'features/analytics/data/observe-performance-telemetry.ts';
  const lines = readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n');
  const typeofImportLine = lines.findIndex((line) => line.includes("typeof import('expo-observe')")) + 1;
  assert.ok(typeofImportLine > 0, `expected a typeof import('expo-observe') in ${relativePath}`);

  const found = specifiersIn(relativePath);
  assert.ok(
    found.some(({ specifier, line }) => specifier === 'expo-observe' && line === typeofImportLine),
    `expected the reader to report expo-observe on line ${typeofImportLine}, got ${JSON.stringify(found)}`,
  );
});

// O5, one button system: a feature's buttons are `Button`, `ButtonPair`, `IconButton` or
// `GlassButton` from `components/ui`. A raw `Pressable` (or `PressScale`, or a Touchable) in
// feature presentation code is a row, tile, chip, swatch, link or field accessory, and each
// file may hold only the number listed here. The counts only shrink; a stale entry fails.
const rawPressableAllowlist = Object.freeze({
  // O10: a colour swatch, a category tile of the type picker, an ownership card.
  'features/wardrobe/presentation/color-swatch.tsx': 1,
  'features/wardrobe/presentation/garment-type-picker.tsx': 1,
  'features/wardrobe/presentation/ownership-choice.tsx': 1,
  'features/wardrobe/presentation/wardrobe-category-chip.tsx': 1,
  'features/wardrobe/presentation/wardrobe-grid-tile.tsx': 1,
  'features/wardrobe/presentation/wardrobe-option.tsx': 1,
  'features/wardrobe/presentation/garment-type-tile.tsx': 1,
  // The provider attribution link.
  'features/weather/presentation/weather-attribution.tsx': 1,
  // The hero board and the alternate tiles.
  'features/today/presentation/today-screen.tsx': 2,
  // O6: the board caption, the garment drawing's target and the piece row open one sheet.
  'features/today/presentation/outfit-detail-screen.tsx': 3,
  // The text field's inline clear glyph.
  'features/profile/presentation/name-input.tsx': 1,
  // The Closet heading row and a category cell (O9; the rack is `ClosetRack`'s own button).
  'features/profile/presentation/profile-screen.tsx': 2,
  'features/profile/presentation/style-aesthetics-options.tsx': 1,
  'features/profile/presentation/preference-option.tsx': 1,
});

const rawPressablePattern = /<(?:Pressable|PressScale|AnimatedPressable|Touchable\w*)\b/g;

test('feature presentation code draws buttons only through the button primitives (O5)', () => {
  const counts = {};
  for (const relativePath of sourceFiles()) {
    if (!/^features\/[^/]+\/presentation\/.+\.tsx$/.test(relativePath)) continue;
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    const found = text.match(rawPressablePattern)?.length ?? 0;
    if (found > 0) counts[relativePath] = found;
  }

  assert.deepEqual(
    counts,
    rawPressableAllowlist,
    'a raw Pressable in feature presentation code must be a listed row, tile, chip or link; '
      + 'a button uses Button, ButtonPair, IconButton or GlassButton from components/ui',
  );
});
