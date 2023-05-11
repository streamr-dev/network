---
id: "UpdateEncryptionKeyOptions"
title: "Interface: UpdateEncryptionKeyOptions"
sidebar_label: "UpdateEncryptionKeyOptions"
sidebar_position: 0
custom_edit_url: null
---

## Properties

### distributionMethod

• **distributionMethod**: ``"rotate"`` \| ``"rekey"``

Determines how the new key will be distributed to subscribers.

**`Remarks`**

With `rotate`, the new key will be sent to the stream alongside the next published message. The key will be
encrypted using the current key. Only after this will the new key be used for publishing. This
provides forward secrecy.

With `rekey`, we for each subscriber to fetch the new key individually. This ensures each subscriber's
permissions are revalidated before they are given the new key.

___

### key

• `Optional` **key**: [`EncryptionKey`](../classes/EncryptionKey.md)

Provide a specific key to be used. If left undefined, a new key is generated automatically.

___

### streamId

• **streamId**: `string`

The Stream ID for which this key update applies.
