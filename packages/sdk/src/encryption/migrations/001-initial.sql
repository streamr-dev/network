--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS GroupKeys (
    id TEXT,
    groupKey TEXT,
    streamId TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS name ON GroupKeys (id);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX IF EXISTS name;
DROP TABLE IF EXISTS GroupKeys;
