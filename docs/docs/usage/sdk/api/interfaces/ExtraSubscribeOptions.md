# Interface: ExtraSubscribeOptions

## Properties

### erc1271Contract?

> `optional` **erc1271Contract**: `string`

Subscribe on behalf of a contract implementing the [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) standard.
The streamr client wallet address must be an authorized signer for the contract.

***

### raw?

> `optional` **raw**: `boolean`

Subscribe raw with validation, permission checking, ordering, gap filling,
and decryption _disabled_.

***

### resend?

> `optional` **resend**: [`ResendOptions`](../api.md#resendoptions)
