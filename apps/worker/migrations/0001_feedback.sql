CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY NOT NULL,
  message TEXT NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  locale TEXT NOT NULL CHECK (locale IN ('tr', 'en')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback (created_at);
