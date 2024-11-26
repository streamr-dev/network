# Interface: Overrides

The overrides for a contract transaction.

## Extends

- `Omit`\<`TransactionRequest`, `"to"` \| `"data"`\>

## Properties

### accessList?

> `optional` **accessList**: `null` \| `AccessListish`

The [[link-eip-2930]] access list. Storage slots included in the access
 list are //warmed// by pre-loading them, so their initial cost to
 fetch is guaranteed, but then each additional access is cheaper.

#### Inherited from

`Omit.accessList`

***

### blobs?

> `optional` **blobs**: `null` \| `BlobLike`[]

Any blobs to include in the transaction (see [[link-eip-4844]]).

#### Inherited from

`Omit.blobs`

***

### blobVersionedHashes?

> `optional` **blobVersionedHashes**: `null` \| `string`[]

The blob versioned hashes (see [[link-eip-4844]]).

#### Inherited from

`Omit.blobVersionedHashes`

***

### blockTag?

> `optional` **blockTag**: `BlockTag`

When using ``call`` or ``estimateGas``, this allows a specific
 block to be queried. Many backends do not support this and when
 unsupported errors are silently squelched and ``"latest"`` is used.

#### Inherited from

`Omit.blockTag`

***

### chainId?

> `optional` **chainId**: `null` \| `BigNumberish`

The chain ID for the network this transaction is valid on.

#### Inherited from

`Omit.chainId`

***

### customData?

> `optional` **customData**: `any`

A custom object, which can be passed along for network-specific
 values.

#### Inherited from

`Omit.customData`

***

### enableCcipRead?

> `optional` **enableCcipRead**: `boolean`

When using ``call``, this enables CCIP-read, which permits the
 provider to be redirected to web-based content during execution,
 which is then further validated by the contract.

 There are potential security implications allowing CCIP-read, as
 it could be used to expose the IP address or user activity during
 the fetch to unexpected parties.

#### Inherited from

`Omit.enableCcipRead`

***

### from?

> `optional` **from**: `null` \| `AddressLike`

The sender of the transaction.

#### Inherited from

`Omit.from`

***

### gasLimit?

> `optional` **gasLimit**: `null` \| `BigNumberish`

The maximum amount of gas to allow this transaction to consume.

#### Inherited from

`Omit.gasLimit`

***

### gasPrice?

> `optional` **gasPrice**: `null` \| `BigNumberish`

The gas price to use for legacy transactions or transactions on
 legacy networks.

 Most of the time the ``max*FeePerGas`` is preferred.

#### Inherited from

`Omit.gasPrice`

***

### kzg?

> `optional` **kzg**: `null` \| `KzgLibrary`

An external library for computing the KZG commitments and
 proofs necessary for EIP-4844 transactions (see [[link-eip-4844]]).

 This is generally ``null``, unless you are creating BLOb
 transactions.

#### Inherited from

`Omit.kzg`

***

### maxFeePerBlobGas?

> `optional` **maxFeePerBlobGas**: `null` \| `BigNumberish`

The maximum fee per blob gas (see [[link-eip-4844]]).

#### Inherited from

`Omit.maxFeePerBlobGas`

***

### maxFeePerGas?

> `optional` **maxFeePerGas**: `null` \| `BigNumberish`

The [[link-eip-1559]] maximum total fee to pay per gas. The actual
 value used is protocol enforced to be the block's base fee.

#### Inherited from

`Omit.maxFeePerGas`

***

### maxPriorityFeePerGas?

> `optional` **maxPriorityFeePerGas**: `null` \| `BigNumberish`

The [[link-eip-1559]] maximum priority fee to pay per gas.

#### Inherited from

`Omit.maxPriorityFeePerGas`

***

### nonce?

> `optional` **nonce**: `null` \| `number`

The nonce of the transaction, used to prevent replay attacks.

#### Inherited from

`Omit.nonce`

***

### type?

> `optional` **type**: `null` \| `number`

The transaction type.

#### Inherited from

`Omit.type`

***

### value?

> `optional` **value**: `null` \| `BigNumberish`

The transaction value (in wei).

#### Inherited from

`Omit.value`
