# Class: EncryptionKey

GroupKeys are AES cipher keys, which are used to encrypt/decrypt StreamMessages (when encryptionType is AES).
Each group key contains 256 random bits of key data and an UUID.

## Constructors

### new EncryptionKey()

> **new EncryptionKey**(`id`, `data`): [`EncryptionKey`](EncryptionKey.md)

#### Parameters

• **id**: `string`

• **data**: `Buffer`

#### Returns

[`EncryptionKey`](EncryptionKey.md)

## Methods

### generate()

> `static` **generate**(`id`): [`EncryptionKey`](EncryptionKey.md)

#### Parameters

• **id**: `string` = `...`

#### Returns

[`EncryptionKey`](EncryptionKey.md)
