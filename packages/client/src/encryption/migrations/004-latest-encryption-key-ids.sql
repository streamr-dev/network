--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS LatestEncryptionKeyIds (
    key_ TEXT NOT NULL PRIMARY KEY,
    value_ TEXT
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE LatestEncryptionKeyIds;

