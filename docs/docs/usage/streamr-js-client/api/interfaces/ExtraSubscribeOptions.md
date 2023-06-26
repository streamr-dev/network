---
id: "ExtraSubscribeOptions"
title: "Interface: ExtraSubscribeOptions"
sidebar_label: "ExtraSubscribeOptions"
sidebar_position: 0
custom_edit_url: null
---

## Properties

### entryPoints

• `Optional` **entryPoints**: [`JsonPeerDescriptor`](JsonPeerDescriptor.md)[]

Configure known entry points to the stream 
(e.g. for private streams, or if you want to avoid DHT lookups).

___

### raw

• `Optional` **raw**: `boolean`

Subscribe raw with validation, permission checking, ordering, gap filling,
and decryption _disabled_.

___

### resend

• `Optional` **resend**: [`ResendOptions`](../index.md#resendoptions)
