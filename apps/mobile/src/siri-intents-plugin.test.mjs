// Locks the Siri intents config plugin's project edits against the Expo prebuild template: the App
// Group entitlement, and the tracked sources in the app target exactly once, however often
// prebuild runs on the same project.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-siri-intents.js');
const { IOSConfig } = require('expo/config-plugins');

const sourceDirectory = path.join(import.meta.dirname, '..', 'native', 'siri-intents');

function templateProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'siri-intents-plugin-'));
  const template = path.join(path.dirname(require.resolve('expo/package.json')), 'template.tgz');
  execFileSync('tar', ['-xzf', template, '-C', root, '--strip-components=1', 'package/ios/HelloWorld.xcodeproj/project.pbxproj']);
  return IOSConfig.XcodeUtils.getPbxproj(root);
}

function buildPhaseFiles(project, section) {
  return Object.values(project.hash.project.objects[section])
    .filter((phase) => typeof phase === 'object')
    .flatMap((phase) => phase.files.map((file) => file.comment));
}

test('the App Group joins existing app groups once', () => {
  const once = plugin.addAppGroup({ 'com.apple.security.application-groups': ['group.other'] });
  assert.deepEqual(once['com.apple.security.application-groups'], ['group.other', 'group.com.ubrn.kuyara']);
  assert.deepEqual(plugin.addAppGroup(once), once);
  assert.deepEqual(plugin.addAppGroup({})['com.apple.security.application-groups'], ['group.com.ubrn.kuyara']);
});

test('every tracked source lands in the app target once, even when prebuild runs twice', () => {
  const files = plugin.listSources(sourceDirectory);
  assert.ok(files.includes('AppShortcuts.xcstrings'));
  const project = templateProject();
  plugin.addSourcesToProject(project, 'HelloWorld', files);
  plugin.addSourcesToProject(project, 'HelloWorld', files);

  const swift = files.filter((file) => file.endsWith('.swift'));
  const catalogs = files.filter((file) => file.endsWith('.xcstrings'));
  const sources = buildPhaseFiles(project, 'PBXSourcesBuildPhase');
  const resources = buildPhaseFiles(project, 'PBXResourcesBuildPhase');
  for (const file of swift) assert.equal(sources.filter((entry) => entry === `${file} in Sources`).length, 1, file);
  for (const file of catalogs) assert.equal(resources.filter((entry) => entry === `${file} in Resources`).length, 1, file);

  const groups = Object.values(project.hash.project.objects.PBXGroup).filter((group) => group.name === 'SiriIntents');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].path, 'HelloWorld/SiriIntents');
  assert.equal(groups[0].children.length, files.length);
  const references = project.pbxFileReferenceSection();
  for (const child of groups[0].children) {
    const reference = references[child.value];
    assert.ok(!Object.values(reference).includes(undefined), child.comment);
    if (child.comment.endsWith('.xcstrings')) assert.equal(reference.lastKnownFileType, 'text.json.xcstrings');
  }
});

test('an unexpected project shape fails the prebuild', () => {
  assert.throws(() => plugin.addSourcesToProject(templateProject(), 'kuyara', plugin.listSources(sourceDirectory)));
});
