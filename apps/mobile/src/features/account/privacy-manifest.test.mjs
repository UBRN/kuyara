// The privacy manifest ships in the binary (ADR 0041 section 10): the account adds Email
// Address, Name (the display name), User ID and Other User Content (the Closet, History, daily
// choices, departures and the synced profile fields), each linked to the person, for App
// Functionality only, never tracking. Photos join only with photo backup.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appJson = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../app.json'), 'utf8'));
const manifest = appJson.expo.ios.privacyManifests;
const declared = new Map(manifest.NSPrivacyCollectedDataTypes.map((entry) => [entry.NSPrivacyCollectedDataType, entry]));

const accountTypes = [
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeOtherUserContent',
];

test('the account data types are declared linked, for App Functionality only, and never tracking', () => {
  for (const type of accountTypes) {
    assert.deepEqual(declared.get(type), {
      NSPrivacyCollectedDataType: type,
      NSPrivacyCollectedDataTypeLinked: true,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    }, type);
  }
});

test('the manifest declares no tracking, no tracking domain and no photo collection', () => {
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.equal(manifest.NSPrivacyTrackingDomains, undefined);
  assert.equal(declared.has('NSPrivacyCollectedDataTypePhotosorVideos'), false);
  for (const entry of manifest.NSPrivacyCollectedDataTypes) assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false);
});

test('the analytics and diagnostics types stay as they were', () => {
  assert.deepEqual([...declared.keys()].filter((type) => !accountTypes.includes(type)), [
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeOtherUsageData',
    'NSPrivacyCollectedDataTypePerformanceData',
    'NSPrivacyCollectedDataTypeOtherDiagnosticData',
    'NSPrivacyCollectedDataTypeCrashData',
    'NSPrivacyCollectedDataTypeDeviceID',
  ]);
});
