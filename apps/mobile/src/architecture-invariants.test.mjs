// The project's import boundaries are also greppable `rg` invariants. This file is the
// automated guard for them: it walks `apps/mobile/src` itself instead of shelling out, so the
// rules hold in CI without depending on ripgrep being installed.
//
// Scope note: every literal specifier is inspected: `import ... from '<spec>'`,
// `export ... from '<spec>'`, side-effect `import '<spec>'`, `require('<spec>')`, and
// `import('<spec>')` in both its forms, the dynamic `await import('<spec>')` and the type-level
// `typeof import('<spec>')`. A type-only reference counts: `import type { X } from '<spec>'`
// already does, the `rg` invariants match the text either way, and the adapters
// name their SDK through `typeof import(...)` today. Test files (`*.test.*`, which also covers
// `*.component.test.*`) are skipped for every rule: component tests legitimately call
// `jest.mock('@expo/ui/...')` and friends, and the Observe check uses
// `--glob '!*.test.*'`. Non-test helpers under `__tests__/` stay in scope, exactly as they do
// for those `rg` commands; a shared mock of a guarded package belongs next to the wrapper it
// stands in for (`components/ui/__tests__/expo-ui-test-mock.tsx`), not under a feature.
// The sixth rule (cross-feature imports) is the only one that exempts `import type` statements, and
// its allowlist of pre-existing violations only shrinks: a stale entry fails the test.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const sourceRoot = import.meta.dirname;
const repoRelativeRoot = 'apps/mobile/src';

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const skippedDirectories = new Set(['node_modules', '.expo', '.expo-shared', 'dist', 'build']);

/** Every non-test source file under `src`, as paths relative to `src` in posix form. */
function sourceFiles(directory = sourceRoot, { includeTests = false } = {}, relative = '') {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      found.push(...sourceFiles(path.join(directory, entry.name), { includeTests }, entryRelative));
      continue;
    }

    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) {
      continue;
    }
    if (!includeTests && entry.name.includes('.test.')) {
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
    name: 'expo-localization has one device-locale importer',
    matches: packageMatcher('expo-localization'),
    forbiddenDirectories: null,
    allowedDirectories: ['localization/device-locale.ts'],
    ruleText: 'Device temperature settings enter through localization/device-locale.ts only.',
  },
  {
    name: 'components/ui is the only importer of @expo/ui and expo-haptics',
    matches: (specifier) => packageMatcher('@expo/ui')(specifier) || packageMatcher('expo-haptics')(specifier),
    forbiddenDirectories: ['features/'],
    allowedDirectories: null,
    ruleText:
      'Feature code never imports `@expo/ui` or `expo-haptics`. '
      + '`components/ui` wraps both and is the only importer; `rg \"@expo/ui|expo-haptics\" '
      + 'apps/mobile/src/features` must return nothing. Native controls are wrapped once so the '
      + 'control layer stays replaceable (ADR 0019). Wrap the control in `components/ui` and import '
      + 'that wrapper from the feature instead.',
  },
  {
    name: 'the Foundation Models module has exactly one importer',
    matches: modulePathMatcher('modules/kuyara-on-device-ai'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/recommendation/data/'],
    ruleText:
      'The local Foundation Models Expo module has exactly one '
      + 'importer. `rg \"modules/kuyara-on-device-ai\" apps/mobile/src` must return only files under '
      + '`apps/mobile/src/features/recommendation/data/` (ADR 0034). Feature code never imports the '
      + 'native module; it goes through the recommendation data adapter.',
  },
  {
    name: 'expo-observe has a single PerformanceTelemetry adapter',
    matches: packageMatcher('expo-observe'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/analytics/data/'],
    ruleText:
      'EAS Observe reaches Observe only through the project-owned '
      + '`PerformanceTelemetry` boundary; `rg \"expo-observe\" apps/mobile/src --glob \'!*.test.*\'` '
      + 'must return only its single adapter (ADR 0033 section 7). Observe is observability, not '
      + 'product analytics: route the call through the adapter under features/analytics/data/.',
  },
  {
    name: 'posthog-react-native has a single ProductAnalytics adapter',
    matches: packageMatcher('posthog-react-native'),
    forbiddenDirectories: null,
    allowedDirectories: ['features/analytics/data/'],
    ruleText:
      'Analytics reaches PostHog only through the project-owned '
      + '`ProductAnalytics` boundary and the reviewed event taxonomy; do not add provider SDK calls '
      + 'in features or emit events outside an approved task (ADR 0023). Emit through the '
      + 'ProductAnalytics boundary under features/analytics/data/, never the provider SDK.',
  },
  {
    name: 'expo-sqlite is opened in one place under infrastructure/sqlite',
    matches: packageMatcher('expo-sqlite'),
    forbiddenDirectories: null,
    allowedDirectories: ['infrastructure/sqlite/'],
    ruleText:
      'UI and domain code must not import SQLite, Supabase, '
      + 'Firebase, WeatherKit, Cloudflare, or provider-specific SDKs directly, and access SQLite '
      + 'only through repository interfaces and local data '
      + 'sources. This could also read as permitting a feature\'s local data source to '
      + 'import the SDK; docs/architecture.md pins the narrower reading: "Only the infrastructure '
      + 'adapter imports `expo-sqlite`." The SDK is opened once in infrastructure/sqlite/ and '
      + 'everything else takes the `SqliteDatabase` handle from there. Widening this allowance is '
      + 'an architecture decision to record in docs/architecture.md first, not a test fix.',
  },
  {
    name: 'the account SDK packages are imported only under features/account/data/',
    matches: (specifier) => [
      '@supabase/supabase-js', 'expo-apple-authentication',
      '@react-native-google-signin/google-signin', 'expo-secure-store',
    ].some((packageName) => packageMatcher(packageName)(specifier)),
    forbiddenDirectories: null,
    allowedDirectories: ['features/account/data/'],
    ruleText:
      'The Supabase client library, native Apple and Google sign-in and the secure key store '
      + 'are imported only from the account feature\'s data layer; UI and domain code never '
      + 'import them (ADR 0041 sections 9 and 12). Reach them through the account feature\'s '
      + 'application layer.',
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
// shows, drawn in its own palette like any outfit. The "Easier to see" preview card (O13,
// ADR 0030 section 5) is the second fixed sample, drawn the same way.
const boardFiles = [
  'features/today/presentation/',
  'features/profile/presentation/onboarding-screen.tsx',
  'features/profile/presentation/easier-to-see-screen.tsx',
];
test('every garment board carries its outfit palette and only Today draws one', () => {
  const boards = sourceFiles().flatMap((relativePath) => (
    [...readFileSync(path.join(sourceRoot, relativePath), 'utf8').matchAll(/<Garment(?:Swap)?Board\b[\s\S]*?\/>/g)]
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

// Each entry is one pre-existing runtime import forbidden by the cross-feature boundary.
// Remove the entry when its fix lands; a stale entry fails the test. The ceiling below only
// falls: adding an entry to make a new violation pass is not allowed.
const crossFeatureInternalImportAllowlist = [
  // Onboarding renders weather's location controls; pass them in from app/onboarding.tsx as a slot.
  ['features/profile/presentation/onboarding-screen.tsx', 'features/weather/presentation/location-selection-controls'],
].map(([importer, module]) => `${importer} -> ${module}`);

test('a feature reaches another feature only through its domain or application layer', () => {
  const ruleText =
    'A feature reaches another feature only through that '
    + 'feature\'s domain or application layer; an `import type` of an interface is the one exception. '
    + 'Composition code (the route files under `app/`, each feature\'s application provider, and the '
    + 'background task entry) may import a feature\'s data and presentation modules; feature code may '
    + 'not. Reach the other feature through its application context, hook or exported factory, move a '
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
  assert.equal(
    crossFeatureInternalImportAllowlist.length,
    1,
    'the cross-feature allowlist only shrinks: fix the import instead of listing it, and lower this count when an entry goes',
  );
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
  // O6: the piece row opens the piece's sheet (the board changes pieces since Phase 7).
  'features/today/presentation/outfit-detail-screen.tsx': 1,
  // Phase 7: a candidate row of the piece picker.
  'features/today/presentation/piece-picker-sheet.tsx': 1,
  // The text field's inline clear glyph.
  'features/profile/presentation/name-input.tsx': 1,
  // The Closet heading row and a category cell (O9; the rack is `ClosetRack`'s own button).
  'features/profile/presentation/profile-screen.tsx': 2,
  'features/profile/presentation/style-aesthetics-options.tsx': 1,
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

// Every exported symbol is used beyond its own definition, in production code, in a test or in
// a script. An export nothing reads is dead weight that still looks like API. The allowlist only
// shrinks: a stale entry fails. `app/` is out of the export scan (expo-router reads its route
// files by convention: `default`, `unstable_settings`, `ErrorBoundary`); this file is out of the
// count so the allowlist cannot vouch for itself.
const unusedExportAllowlist = new Set([
  // The compile-time exhaustiveness proof: it is read by the type checker, not by name.
  'AnalyticsPropertyKeysAreExhaustive',
]);

test('every exported symbol has a use outside its own definition', () => {
  const exportPattern =
    /^export (?:async )?(?:function|const|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm;
  const self = path.basename(import.meta.filename);
  const appRoot = path.join(sourceRoot, '..');
  const pool = [
    ...sourceFiles(sourceRoot, { includeTests: true })
      .filter((relativePath) => relativePath !== self)
      .map((relativePath) => ({
        relativePath,
        text: readFileSync(path.join(sourceRoot, relativePath), 'utf8'),
      })),
    ...['scripts', 'test'].flatMap((folder) => (
      sourceFiles(path.join(appRoot, folder), { includeTests: true }).map((relativePath) => ({
        relativePath: `../${folder}/${relativePath}`,
        text: readFileSync(path.join(appRoot, folder, relativePath), 'utf8'),
      }))
    )),
  ];
  const occurrences = new Map();
  for (const { text } of pool) {
    for (const word of text.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      occurrences.set(word, (occurrences.get(word) ?? 0) + 1);
    }
  }

  const unused = [];
  for (const { relativePath, text } of pool) {
    if (relativePath.startsWith('../') || relativePath.includes('.test.')) continue;
    if (relativePath.startsWith('app/')) continue;
    for (const match of text.matchAll(exportPattern)) {
      const name = match[1];
      if (occurrences.get(name) === 1 && !unusedExportAllowlist.has(name)) {
        unused.push(`${relativePath}: ${name}`);
      }
    }
  }
  assert.deepEqual(unused, [], 'an exported symbol nothing else names is dead code: delete it');

  const stale = [...unusedExportAllowlist].filter((name) => occurrences.get(name) !== 1);
  assert.deepEqual(stale, [], 'an allowlisted export now has a use (or is gone): drop it from the list');
});

// ADR 0041 section 12: PostHog is never linked to the account. `identify()` is never called,
// so analytics stays on its install identifier and neither `localProfileId` nor a Supabase user
// ID becomes an analytics identifier.
test('mobile production code never calls identify()', () => {
  const found = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/\.identify\(/.test(line)) found.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(found, [], 'analytics stays on its install identifier (ADR 0041 section 12)');
});

// Mobile production code never calls the global `fetch` by its bare name: a client takes its
// `fetch` as a dependency, so a unit test hands it a fake instead of patching the global.
test('mobile production code has no bare global fetch call', () => {
  const bareFetch = /(?:^|[^.\w])fetch\(/;
  const found = [];
  for (const relativePath of sourceFiles()) {
    const lines = readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (bareFetch.test(line)) found.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(found, [], 'take `fetch` as a parameter and call that');
});

// A test double never sits beside production code: the mobile sample provider lives under a
// `__tests__` folder, where no composition root can import it by accident. The Worker half
// is in `apps/worker/src/architecture-invariants.test.mjs`.
test('mobile deterministic test doubles live only under __tests__ folders', () => {
  const doublePattern = /^export class Deterministic(?:Mock|Stub|Fake)\w*/m;
  const misplaced = sourceFiles()
    .filter((relativePath) => !relativePath.split('/').includes('__tests__'))
    .filter((relativePath) => (
      doublePattern.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))
    ))
    .map((relativePath) => `${repoRelativeRoot}/${relativePath}`);

  assert.deepEqual(misplaced, [], 'move the test double under a __tests__ folder next to it');
});

// Each `Local*Repository` is constructed in exactly one file: the loader or provider that opens
// and migrates the database for it. A second construction site (the background task once built
// three of them by hand) drifts from the first in open, migrate or clock wiring.
test('each Local repository class is constructed in exactly one file', () => {
  const sites = new Map();
  for (const relativePath of sourceFiles()) {
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    for (const [, className] of text.matchAll(/new (Local\w+Repository)\(/g)) {
      sites.set(className, new Set([...(sites.get(className) ?? []), relativePath]));
    }
  }

  assert.ok(sites.size >= 5, `expected the composition sites to be found, saw ${sites.size} classes`);
  assert.deepEqual(
    [...sites].filter(([, files]) => files.size > 1).map(([name, files]) => `${name}: ${[...files].join(', ')}`),
    [],
    'construct each repository in one loader or provider and import that function elsewhere',
  );
});

// Row-identity validators have one home, `domain/record-identity.ts`, so every repository trusts
// a stored row by the same rule.
test('UUID v4 and UTC ISO validators are defined only in domain/record-identity.ts, by name or by body', () => {
  const copies = [];
  for (const relativePath of sourceFiles()) {
    if (relativePath === 'domain/record-identity.ts') continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/function (?:isUuidV4|isUtcIso)|toISOString\(\) === value/.test(line)) copies.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(copies, [], 'import isUuidV4 or isUtcIsoTimestamp from @/domain/record-identity');
});

// The Worker origin variable is read in one place, `config/`, and the app has no web target
// branch: kuyara ships for iOS and Android only.
test('the Worker base URL variable is read once, under config/', () => {
  const reads = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (line.includes('EXPO_PUBLIC_KUYARA_WORKER_BASE_URL')) reads.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.equal(reads.length, 1, `expected one read, found ${JSON.stringify(reads)}`);
  assert.ok(reads[0].startsWith('config/'), `the read belongs under config/, found ${reads[0]}`);
});

test('mobile source has no web target branch or *.web.* file', () => {
  const hits = [];
  for (const relativePath of sourceFiles()) {
    if (/\.web\.[^/]+$/.test(relativePath)) hits.push(relativePath);
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/['"]web['"]/.test(line)) hits.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(hits, [], 'kuyara ships for iOS and Android; delete the web branch');
});

// Inside one feature the application layer reaches its own data layer as a value only from a
// composition file: a `*-provider.tsx` or a plain `*-loader.ts` factory. Each entry is one
// pre-existing import; the list only shrinks and a stale entry fails.
const sameFeatureApplicationDataAllowlist = [
  ['features/analytics/application/use-screen-interactive.ts', 'features/analytics/data/observe-performance-telemetry'],
  ['features/recommendation/application/ai-probe-state.ts', 'features/recommendation/data/worker-ai-probe-client'],
  ['features/recommendation/application/recommendation-application-controller.ts', 'features/recommendation/data/recommendation-repository'],
  ['features/recommendation/application/recommendation-application-controller.ts', 'features/recommendation/data/worker-ai-client'],
  ['features/recommendation/application/recommendation-application-controller.ts', 'features/recommendation/data/worker-ai-recommendation-mapper'],
  ['features/recommendation/application/use-ai-probe.ts', 'features/recommendation/data/worker-ai-probe-client'],
  ['features/wardrobe/application/wardrobe-application-controller.ts', 'features/wardrobe/data/wardrobe-photo-path'],
  ['features/wardrobe/application/wardrobe-application-controller.ts', 'features/wardrobe/data/wardrobe-repository'],
  ['features/weather/application/place-search-controller.ts', 'features/weather/data/worker-place-search-data-source'],
  ['features/weather/application/weather-application-controller.ts', 'features/weather/data/manual-location-catalog'],
  ['features/weather/application/weather-application-controller.ts', 'features/weather/data/weather-provider'],
  ['features/weather/application/weather-application-controller.ts', 'features/weather/data/weather-repository'],
].map(([importer, module]) => `${importer} -> ${module}`);

test('an application module imports its own feature data as a value only in a provider or loader', () => {
  const seen = new Set();
  const violations = [];

  for (const relativePath of sourceFiles()) {
    if (!/^features\/[^/]+\/application\//.test(relativePath)) continue;
    if (/(?:-provider\.tsx|-loader\.ts)$/.test(relativePath)) continue;
    const typeOnly = typeOnlyImportLines(relativePath);

    for (const { specifier, line } of specifiersIn(relativePath)) {
      const target = featureModuleOf(relativePath, specifier);
      if (target === null || target.feature !== featureOf(relativePath) || target.layer !== 'data') continue;
      if (typeOnly.has(line)) continue;

      const key = `${relativePath} -> ${target.module}`;
      if (sameFeatureApplicationDataAllowlist.includes(key)) {
        seen.add(key);
        continue;
      }
      violations.push(`${repoRelativeRoot}/${relativePath}:${line} imports '${specifier}'`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    'move the construction into a *-provider.tsx or *-loader.ts and take the port as a parameter:\n'
      + violations.map((v) => `  - ${v}`).join('\n'),
  );
  const stale = sameFeatureApplicationDataAllowlist.filter((key) => !seen.has(key));
  assert.deepEqual(stale, [], `remove these entries so the list only shrinks:\n${stale.map((v) => `  - ${v}`).join('\n')}`);
  assert.equal(
    sameFeatureApplicationDataAllowlist.length,
    12,
    'the same-feature allowlist only shrinks: lower this count when an entry goes',
  );
});

// Feature domain code reads no ambient clock and no randomness: a caller hands in the date or
// the id, so a unit test pins it without a fake timer. The one named exception is the
// analytics age-bucket default; the list only shrinks and a stale entry fails.
const domainAmbientReadAllowlist = [
  'features/analytics/domain/analytics-mappers.ts',
];

function nonTestFilesUnder(prefixPattern) {
  return sourceFiles().filter((relativePath) => prefixPattern.test(relativePath));
}

test('feature domain code reads no ambient clock or randomness', () => {
  const ambientRead = /Date\.now\(\)|new Date\(\)|Math\.random|randomUUID/;
  const hits = new Set();
  for (const relativePath of nonTestFilesUnder(/^features\/[^/]+\/domain\//)) {
    if (ambientRead.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))) {
      hits.add(relativePath);
    }
  }

  const violations = [...hits].filter((relativePath) => !domainAmbientReadAllowlist.includes(relativePath));
  assert.deepEqual(violations, [], 'take the date or id as a parameter and read the clock at the edge');
  const stale = domainAmbientReadAllowlist.filter((relativePath) => !hits.has(relativePath));
  assert.deepEqual(stale, [], 'remove these entries so the list only shrinks');
  assert.equal(domainAmbientReadAllowlist.length, 1, 'the domain clock allowlist only shrinks');
});

// An exported function never defaults a time parameter to the ambient clock: the caller
// passes it. The single pre-existing default is the analytics age bucket. The check
// reads only annotated parameters (`: Date`, `: string`, `: number`); an unannotated default
// is not covered.
const clockDefaultAllowlist = [
  'features/analytics/domain/analytics-mappers.ts',
];

test('an exported function does not default a time parameter to the ambient clock', () => {
  const clockDefault = /(?::\s*Date|:\s*string|:\s*number)\s*=\s*(?:new Date\(\)|Date\.now\(\))/;
  const hits = new Set();
  for (const relativePath of sourceFiles()) {
    if (clockDefault.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))) hits.add(relativePath);
  }

  const violations = [...hits].filter((relativePath) => !clockDefaultAllowlist.includes(relativePath));
  assert.deepEqual(violations, [], 'make the time parameter required and pass the clock at the call site');
  const stale = clockDefaultAllowlist.filter((relativePath) => !hits.has(relativePath));
  assert.deepEqual(stale, [], 'remove these entries so the list only shrinks');
  assert.equal(clockDefaultAllowlist.length, 1, 'the clock default allowlist only shrinks');
});

// The dressing-day key of a device-local Date is derived in one place, `local-day.ts`; the only
// other reader of `wardrobeDayKey` is its own module, which builds the key from an instant and
// a zone (`local-day.test.mjs` pins the boundaries).
test('the device-local dressing day key is derived only in recommendation/domain/local-day.ts', () => {
  const callers = sourceFiles()
    .filter((relativePath) => relativePath !== 'features/weather/domain/wardrobe-day.ts')
    .filter((relativePath) => /\bwardrobeDayKey\(/.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8')));

  assert.deepEqual(callers, ['features/recommendation/domain/local-day.ts']);
});

// A swallowed error is justified in one line: an empty `catch` block says nothing about why
// losing the error is safe. The promise form `.catch(() => {})` is the same swallow
// and is held to the same measure, whatever the parameter spelling: `()`, `(error)`,
// `(_error: unknown)` or `error`.
const swallowParameter = String.raw`(?:\(\s*\w*\s*(?::[^)]*)?\)|\w+)`;

test('mobile production code has no empty catch block or empty promise catch handler', () => {
  const empty = new RegExp(
    String.raw`catch(?:\s*\([^)]*\))?\s*\{\s*\}|\.catch\(\s*${swallowParameter}\s*=>\s*\{\s*\}\s*\)`,
    'g',
  );
  const hits = [];
  for (const relativePath of sourceFiles()) {
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    for (const match of text.matchAll(empty)) {
      hits.push(`${repoRelativeRoot}/${relativePath}:${text.slice(0, match.index).split('\n').length}`);
    }
  }

  assert.deepEqual(hits, [], 'say in one comment line why swallowing the error is safe');
});

// The same swallow written `.catch(() => undefined)` (or as the second argument of a `.then`
// whose first returns `undefined`) predates the lock. Each pre-existing site is listed by file
// with its count: the list only shrinks, a stale entry fails, and a new site needs a one-line
// reason or a named helper instead of a new entry. Test files are not read, so this
// file does not count its own patterns.
const undefinedSwallowAllowlist = new Map([
  ['app/_layout.tsx', 1],
  ['components/ui/haptics.ts', 1],
  ['features/analytics/data/create-product-analytics.ts', 1],
  ['features/analytics/data/posthog-product-analytics.ts', 2],
  ['features/notifications/application/weather-alert-observer.tsx', 1],
  ['features/recommendation/application/reask-for-dressing-day.ts', 1],
  ['features/recommendation/data/expo-file-ai-regeneration-budget.ts', 1],
  ['features/recommendation/data/sqlite-outfit-history-repository.ts', 1],
  ['features/walkthrough/application/walkthrough-controller.ts', 1],
  ['features/wardrobe/presentation/piece-edit-sheet.tsx', 2],
  ['features/wardrobe/presentation/wardrobe-item-form-screen.tsx', 6],
]);

test('an error swallowed as `undefined` appears only where the allowlist names it', () => {
  const swallow = new RegExp(
    String.raw`\.catch\(\s*${swallowParameter}\s*=>\s*undefined\s*\)`
      + String.raw`|\.then\(\s*\(\s*\)\s*=>\s*undefined\s*,\s*${swallowParameter}\s*=>\s*undefined\s*\)`,
    'g',
  );
  const counts = new Map();
  for (const relativePath of sourceFiles()) {
    const found = [...readFileSync(path.join(sourceRoot, relativePath), 'utf8').matchAll(swallow)].length;
    if (found > 0) counts.set(relativePath, found);
  }

  const mismatched = [...new Set([...counts.keys(), ...undefinedSwallowAllowlist.keys()])]
    .filter((file) => (counts.get(file) ?? 0) !== (undefinedSwallowAllowlist.get(file) ?? 0))
    .map((file) => `${file}: found ${counts.get(file) ?? 0}, allowed ${undefinedSwallowAllowlist.get(file) ?? 0}`);
  assert.deepEqual(
    mismatched,
    [],
    'justify a new swallow in one line or route it through a named helper; lower the count when a site goes',
  );
  assert.equal(
    [...undefinedSwallowAllowlist.values()].reduce((sum, count) => sum + count, 0),
    18,
    'the `undefined` swallow allowlist only shrinks: lower this total when an entry goes',
  );
});

// Untrusted values are parsed before they are typed: the Closet category reaches the domain
// type through `isWardrobeItemCategory`, never a cast. The weather-condition and on-device AI
// casts of the same kind stay outside this check until their own goals land.
test('the wardrobe category is narrowed by its guard, never cast', () => {
  const casts = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/\bas WardrobeItemCategory\b/.test(line)) casts.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(casts, [], 'narrow with isWardrobeItemCategory instead of casting');
});

// Presentation and routes render a failure; they never sort it. The caught error reaches a
// `classify…` function in the domain or application layer and the screen reads the answer
//.
test('presentation and route code never sorts an error by its class', () => {
  const hits = [];
  for (const relativePath of sourceFiles()) {
    if (!/^(?:features\/[^/]+\/presentation\/|app\/)/.test(relativePath)) continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/instanceof \w+Error/.test(line)) hits.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(hits, [], 'move the error-to-problem mapping into a classify function below the screen');
});

// A pure state or policy module under application/ takes the instant as a parameter, so a
// test pins it without a fake timer and a route reads the clock once at the edge.
test('application state and policy modules do not read the ambient clock', () => {
  const hits = [];
  for (const relativePath of sourceFiles()) {
    if (!/^features\/[^/]+\/application\/[^/]*-(?:state|policy)\.ts$/.test(relativePath)) continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/Date\.now\(\)|new Date\(\)/.test(line)) hits.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(hits, [], 'take `now` as a parameter and pass it from the route');
});

// The dressing-day key has one format owner: `weather/domain/wardrobe-day.ts` builds it,
// answers whether it is an evening (`isEveningDressingDayKey`) and strips it to its date
// (`dressingDayDateKey`). Nobody else spells the suffix as a literal or a regex tail.
test('the dressing-day key suffix is spelled only in weather/domain/wardrobe-day.ts', () => {
  const hits = [];
  for (const relativePath of sourceFiles()) {
    if (relativePath === 'features/weather/domain/wardrobe-day.ts') continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/(['"]):evening\1|\}:evening|:evening\$\//.test(line)) hits.push(`${repoRelativeRoot}/${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(hits, [], 'call isEveningDressingDayKey or dressingDayDateKey from wardrobe-day.ts');
});

// Every message key has a production reader. The type-aware reference search finds
// the keys no non-test file reads; the only ones allowed are read through a computed
// property (`copy[captionKey]`, a `Record<Id, keyof Messages>` table), named here by parent
// with an exact count so a new unread key cannot hide behind them.
const computedlyReadMessageKeys = {
  'TodayMessages.dailyStyle': 3, 'TodayMessages.drift': 3, 'TodayMessages.manualMix.sourceOne': 3,
  'PreferenceMessages': 5, 'AppMessages.weather': 3, 'WalkthroughMessages.steps': 6,
};

test('every message key has a production reader or a counted computed read', () => {
  const root = path.join(sourceRoot, '..');
  const { options, fileNames } = ts.parseJsonConfigFileContent(
    ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
  const service = ts.createLanguageService({
    getScriptFileNames: () => fileNames, getScriptVersion: () => '1', getCurrentDirectory: () => root,
    getScriptSnapshot: (file) => ts.sys.fileExists(file) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)) : undefined,
    getCompilationSettings: () => options, getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
  });
  const file = path.join(sourceRoot, 'localization/messages.ts');
  const unread = {};
  const visit = (node, trail) => {
    if (ts.isParameter(node)) return;
    if (ts.isTypeAliasDeclaration(node)) trail = [node.name.text];
    if (ts.isPropertySignature(node)) {
      trail = [...trail, node.name.getText()];
      const reads = (service.findReferences(file, node.name.getStart()) ?? []).flatMap(({ references }) => references)
        .filter(({ fileName }) => fileName !== file && !/\.test\.|__tests__/.test(fileName));
      if (reads.length === 0 && !node.type?.members) {
        const parent = trail.slice(0, -1).join('.');
        (unread[parent] ??= []).push(trail.at(-1));
      }
    }
    ts.forEachChild(node, (child) => visit(child, trail));
  };
  const aliases = ['AppMessages', 'TodayMessages', 'PreferenceMessages', 'WalkthroughMessages'];
  ts.forEachChild(service.getProgram().getSourceFile(file), (node) => {
    if (ts.isTypeAliasDeclaration(node) && aliases.includes(node.name.text)) visit(node, []);
  });

  assert.deepEqual(Object.fromEntries(Object.entries(unread).map(([parent, keys]) => [parent, keys.length])),
    computedlyReadMessageKeys, `unread message keys: ${JSON.stringify(unread)}`);
});

// Tracked files carry no trace of coding-tool names or of the work process that produced them.
// The pattern is assembled from parts so this file does not match itself. The insight-sentence
// files are the one allowed place: they keep a model name as a banned word in the app's AI output.
const processTracePattern = new RegExp([
  ['cl', 'aude'], ['co', 'dex'], ['anth', 'ropic'], ['sub', 'agent'], ['hand', 'over'],
  ['\\bla', 'ne\\b'], ['\\(C', 'C[0-9]+\\)'], ['to', 'ur A[0-9]'], ['simulator ', 'tour'], ['pony', 'tail'],
  ['\\bgol', 'die\\b'], ['\\barg', 'ent\\b'], ['\\bje', 'v\\b'],
].map((parts) => parts.join('')).join('|'), 'i');
// The planning unit of the work process is a capitalized word; the ordinary lowercase word stays.
const processTermPattern = new RegExp(['\\bGo', 'als?\\b'].join(''));
const processTraceAllowlist = new Set([
  'apps/mobile/src/features/recommendation/domain/insight-sentence.ts',
  'apps/mobile/src/features/recommendation/domain/insight-sentence.test.mjs',
]);

test('tracked text files name no coding tool and no work-process term', () => {
  const repoRoot = path.join(sourceRoot, '..', '..', '..');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  const hits = [];
  for (const relative of tracked) {
    if (processTraceAllowlist.has(relative)) continue;
    let buffer;
    try {
      buffer = readFileSync(path.join(repoRoot, relative));
    } catch {
      continue; // a tracked path deleted in the working tree has nothing to read
    }
    if (buffer.includes(0)) continue; // binary
    buffer.toString('utf8').split('\n').forEach((line, index) => {
      if (processTracePattern.test(line) || processTermPattern.test(line)) hits.push(`${relative}:${index + 1}`);
    });
  }
  assert.deepEqual(hits, [], `remove the tool or process wording at: ${hits.join(', ')}`);
});

// Coding-tool instructions, skills, settings and the store screenshot tooling live in a private
// repository and are linked into a checkout; none of them is tracked here.
test('no private tool instruction, setting or screenshot-tooling path is tracked', () => {
  const repoRoot = path.join(sourceRoot, '..', '..', '..');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  // Assembled from parts so the names do not trip the wording check above.
  const privatePath = new RegExp(`^(?:${[
    'AGENTS[^/]*\\.md', ['CL', 'AUDE[^/]*\\.md'].join(''), ['\\.cl', 'aude/'].join(''), '\\.agents/',
    ['\\.co', 'dex/'].join(''), ['\\.arg', 'ent/'].join(''), ['gol', 'die/'].join(''),
  ].join('|')})`, 'i');
  assert.deepEqual(tracked.filter((relative) => privatePath.test(relative)), []);
});
