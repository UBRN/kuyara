import assert from 'node:assert/strict';
import test from 'node:test';

import { messages } from '../../../localization/messages.ts';
import { pieceOwnershipMarkers } from './piece-ownership-marker.ts';

const expected = {
  // The `Icon` registry draws these as checkmark.circle.fill, hanger, heart.fill and circle.
  owned: { icon: 'checkCircle', ink: 'brandAccent' },
  similar: { icon: 'hanger', ink: 'iconSecondary' },
  wanted: { icon: 'heartFilled', ink: 'iconSecondary' },
  none: { icon: 'circle', ink: 'iconSecondary' },
};

test('every Closet state has one name-button marker, and only the exact match takes the accent', () => {
  assert.deepEqual(Object.keys(pieceOwnershipMarkers).sort(), Object.keys(expected).sort());
  for (const [kind, { icon, ink }] of Object.entries(expected)) {
    assert.equal(pieceOwnershipMarkers[kind].icon, icon, kind);
    assert.equal(pieceOwnershipMarkers[kind].ink, ink, kind);
  }
});

test('each marker speaks its state with the board strings in both languages', () => {
  for (const copy of [messages.en.today, messages.tr.today]) {
    assert.deepEqual(
      Object.fromEntries(Object.entries(pieceOwnershipMarkers).map(([kind, marker]) => [kind, marker.spoken(copy)])),
      {
        owned: copy.ownershipOnBoard.owned,
        similar: copy.ownershipOnBoard.similar,
        wanted: copy.ownershipOnBoard.wanted,
        none: copy.ownershipUntrackedLabel,
      },
    );
  }
  assert.equal(pieceOwnershipMarkers.wanted.spoken(messages.tr.today), 'İsteklerinde');
  assert.equal(pieceOwnershipMarkers.none.spoken(messages.tr.today), 'Gardırobunda yok');
});
