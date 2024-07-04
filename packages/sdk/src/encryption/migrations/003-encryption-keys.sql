--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS EncryptionKeys (
    key_ TEXT NOT NULL PRIMARY KEY,
    value_ TEXT
);

INSERT INTO EncryptionKeys (key_, value_) SELECT "LEGACY::" || id, groupKey FROM GroupKeys;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE EncryptionKeys;

