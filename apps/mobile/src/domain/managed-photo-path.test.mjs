import assert from 'node:assert/strict';
import test from 'node:test';

import { isManagedPhotoPath, managedPhotoRelativePath } from './managed-photo-path.ts';
import { isManagedHistoryPhotoPath } from '../features/recommendation/data/history-photo-path.ts';
import {
  createManagedWardrobePhotoRelativePath,
  isManagedWardrobePhotoRelativePath,
} from '../features/wardrobe/domain/wardrobe-photo-path.ts';

const id = '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const wardrobe = ['kuyara', 'wardrobe', 'photos'];
const history = ['kuyara', 'history', 'photos'];

test('a managed path is the directory, the lowercased id and .jpg, and only a UUID v4 builds one', () => {
  assert.equal(managedPhotoRelativePath(history, id.toUpperCase()), `kuyara/history/photos/${id}.jpg`);
  for (const bad of ['', '../../evil', 'not-an-id', `${id}/x`, '018f0f4d-1d45-1ae7-a8f1-796e8297d3b4']) {
    assert.equal(managedPhotoRelativePath(history, bad), null, bad);
  }
});

test('a path is managed only for its own directory and a UUID v4 stem', () => {
  const own = `kuyara/history/photos/${id}.jpg`;
  assert.equal(isManagedPhotoPath(history, own), true);
  assert.equal(isManagedPhotoPath(history, own.toUpperCase().replace('KUYARA/HISTORY/PHOTOS', 'kuyara/history/photos')), true);
  assert.equal(isManagedPhotoPath(wardrobe, own), false);
  for (const bad of [
    `kuyara/history/photos/${id}.png`,
    `kuyara/history/photos/a/${id}.jpg`,
    `kuyara/history/photos/${id}.jpg/`,
    `/kuyara/history/photos/${id}.jpg`,
    `kuyara/history/photos/x.jpg`,
    `../kuyara/history/photos/${id}.jpg`,
    `kuyaraXhistory/photos/${id}.jpg`,
  ]) {
    assert.equal(isManagedPhotoPath(history, bad), false, bad);
  }
});

test('a directory segment is matched literally, never as a pattern', () => {
  assert.equal(isManagedPhotoPath(['a.b'], `a.b/${id}.jpg`), true);
  assert.equal(isManagedPhotoPath(['a.b'], `aXb/${id}.jpg`), false);
});

test('a normaliser runs first, and a throw or null from it is a refusal', () => {
  const own = `kuyara/history/photos/${id}.jpg`;
  assert.equal(isManagedPhotoPath(history, ` ${own} `), false);
  assert.equal(isManagedPhotoPath(history, ` ${own} `, (value) => value.trim()), true);
  assert.equal(isManagedPhotoPath(history, own, () => null), false);
  assert.equal(isManagedPhotoPath(history, own, () => { throw new Error('unsafe'); }), false);
});

test('the wardrobe reads a path through its record normalisation and the history reads it as stored', () => {
  const wardrobePath = createManagedWardrobePhotoRelativePath(id);
  assert.equal(wardrobePath, `kuyara/wardrobe/photos/${id}.jpg`);
  assert.equal(isManagedWardrobePhotoRelativePath(` ${wardrobePath} `), true);
  assert.equal(isManagedWardrobePhotoRelativePath(`kuyara/history/photos/${id}.jpg`), false);
  assert.equal(isManagedHistoryPhotoPath(`kuyara/history/photos/${id}.jpg`), true);
  assert.equal(isManagedHistoryPhotoPath(` kuyara/history/photos/${id}.jpg`), false);
  assert.equal(isManagedHistoryPhotoPath(wardrobePath), false);
  assert.throws(() => createManagedWardrobePhotoRelativePath('../../evil'));
});
