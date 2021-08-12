--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

DROP INDEX name;
CREATE TEMPORARY TABLE GroupKeysTemp AS SELECT * FROM GroupKeys;
DROP TABLE GroupKeys;

CREATE TABLE IF NOT EXISTS GroupKeys (
    id TEXT NOT NULL PRIMARY KEY,
    groupKey TEXT NOT NULL,
    streamId TEXT NOT NULL
);

INSERT INTO GroupKeys SELECT * FROM GroupKeysTemp;
DROP TABLE GroupKeysTemp;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

CREATE TEMPORARY TABLE GroupKeysTemp AS SELECT * FROM GroupKeys;
DROP TABLE GroupKeys;

CREATE TABLE GroupKeys (
    id TEXT,
    groupKey TEXT,
    streamId TEXT
);

CREATE UNIQUE INDEX name ON GroupKeys (id);
INSERT INTO GroupKeys SELECT * FROM GroupKeysTemp;
DROP TABLE GroupKeysTemp;
