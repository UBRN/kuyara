// The launch-time consent read, exercised against a real SQLite file rather than a fake, so
// the query and the "missing table reads as undecided" rule are proved against the engine.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { readAnalyticsConsentSync } from './data/analytics-consent-sync-source.ts';

function withTemporaryDatabase(prepare) {
  const directory = mkdtempSync(join(tmpdir(), 'kuyara-consent-'));
  const path = join(directory, 'kuyara.db');
  const setup = new DatabaseSync(path);
  try {
    prepare?.(setup);
  } finally {
    setup.close();
  }

  const open = () => {
    const database = new DatabaseSync(path);
    return {
      getFirstSync: (source) => database.prepare(source).get() ?? null,
      closeSync: () => database.close(),
    };
  };
  return { open, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function createProfileTable(database, consent) {
  database.exec(`
    CREATE TABLE local_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      singleton_key INTEGER NOT NULL DEFAULT 1,
      analytics_consent TEXT NOT NULL DEFAULT 'undecided'
    )
  `);
  database
    .prepare('INSERT INTO local_profiles (id, singleton_key, analytics_consent) VALUES (?, 1, ?)')
    .run('profile-one', consent);
}

test('the stored answer is read back for each of the three states', () => {
  for (const consent of ['undecided', 'granted', 'withdrawn']) {
    const { open, cleanup } = withTemporaryDatabase((database) =>
      createProfileTable(database, consent),
    );
    try {
      assert.equal(readAnalyticsConsentSync(open), consent);
    } finally {
      cleanup();
    }
  }
});

test('a database without the table reads as undecided', () => {
  const { open, cleanup } = withTemporaryDatabase();
  try {
    assert.equal(readAnalyticsConsentSync(open), 'undecided');
  } finally {
    cleanup();
  }
});

test('an empty profile table reads as undecided', () => {
  const { open, cleanup } = withTemporaryDatabase((database) => {
    database.exec(
      'CREATE TABLE local_profiles (id TEXT PRIMARY KEY NOT NULL, singleton_key INTEGER NOT NULL, analytics_consent TEXT)',
    );
  });
  try {
    assert.equal(readAnalyticsConsentSync(open), 'undecided');
  } finally {
    cleanup();
  }
});

test('a value outside the closed set reads as undecided', () => {
  const { open, cleanup } = withTemporaryDatabase((database) =>
    createProfileTable(database, 'maybe'),
  );
  try {
    assert.equal(readAnalyticsConsentSync(open), 'undecided');
  } finally {
    cleanup();
  }
});

test('an opener that throws reads as undecided rather than failing the launch', () => {
  assert.equal(
    readAnalyticsConsentSync(() => {
      throw new Error('the database could not be opened');
    }),
    'undecided',
  );
});

test('the handle is always closed, including after a failed read', () => {
  let closed = 0;
  const reader = {
    getFirstSync: () => {
      throw new Error('no such table: local_profiles');
    },
    closeSync: () => {
      closed += 1;
    },
  };

  assert.equal(readAnalyticsConsentSync(() => reader), 'undecided');
  assert.equal(closed, 1);
});
