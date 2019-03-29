# Protocol

## Data Types

Our protocol is a JSON protocol. This means that we have the following types at our disposal: `string`, `number`, `object`, `array`, `boolean` and `null`. In the following, all `number` are positive integers or zero.

## Layers

The Streamr Protocol is made of three layers:
- **Communication Layer:** Responsible for end-to-end unicast/multicast/broadcast communication primitives in a centralized network or a p2p network. Can be HTTP, Websocket or a custom gossiping protocol.
- **Control Layer:** Defines the control messages allowing communication entities to publish, subscribe, resend, etc... These messages are the payload of the Communication Layer messages.
- **Message Layer:** Some messages in the Control Layer carry messages published in streams. The Message Layer defines the format of these message payloads, consisting of data and metadata of the messages.

This documentation describes the Control Layer and Message Layer since they are common to any network configuration.

## Table of contents

- [Control Layer](#control-layer)
    - [PublishRequest](#publishrequest)
    - [SubscribeRequest](#subscriberequest)
    - [UnsubscribeRequest](#unsubscriberequest)
    - [ResendLastRequest](#resendlastrequest)
    - [ResendFromRequest](#resendfromrequest)
    - [ResendRangeRequest](#resendrangerequest)
    - [BroadcastMessage](#broadcastmessage)
    - [UnicastMessage](#unicastmessage)
    - [SubscribeResponse](#subscriberesponse)
    - [UnsubscribeResponse](#unsubscriberesponse)
    - [ResendResponseResending](#resendresponseresending)
    - [ResendResponseResent](#resendresponseresent)
    - [ResendResponseNoResend](#resendresponsenoresend)
    - [ErrorResponse](#errorresponse)
- [Message Layer](#message-layer)
    - [StreamMessage](#streammessage)
    - [MessageID](#messageid)
    - [MessageRef](#messageref)


## Control Layer

All messages of the control layer are transmitted as JSON arrays with the following fields : `[version, type, ...typeSpecificFields]`.
`version` describes the version of the Control Layer. `type` is an integer to identify the message type according to the following table: 

messageType | Description
----------- | -----------
0 | BroadcastMessage
1 | UnicastMessage
2 | SubscribeResponse
3 | UnsubscribeResponse
4 | ResendResponseResending
5 | ResendResponseResent
6 | ResendResponseNoResend
7 | ErrorResponse
8 | PublishRequest
9 | SubscribeRequest
10 | UnsubscribeRequest
11 | ResendLastRequest
12 | ResendFromRequest
13 | ResendRangeRequest

We start by describing the requests and then the responses.

### Requests sent

Also see the [Javascript client](https://github.com/streamr-dev/streamr-client) documentation.

#### PublishRequest

Publishes a new message to a stream. Requires a write permission to the stream. Authentication requires the session token to be set. It contains a `StreamMessage` as a payload at the Message Layer level. The `StreamMessage` representation is also an array (nested in the `PublishRequest` array) which is described in the [StreamMessage](#streammessage) section.

```
[version, type, streamMessage, sessionToken]
```
Example:
```
[1, 8, [...streamMessageFields], "my-session-token"]
```

Field    | Type | Description
-------- | ---- | --------
`streamMessage` | StreamMessage | The array representation of the `StreamMessage` to publish. Defined in the Message Layer.
`sessionToken` | `string` | User's session token retrieved with some authentication method.

#### SubscribeRequest

Requests that the client be subscribed to a stream-partition. Will result in a `SubscribeResponse` message, and a stream of `BroadcastMessage` as they are published.

```
[version, type, streamId, streamPartition, sessionToken]
```
Example:
```
[1, 9, "stream-id", 0, "my-session-token"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id to subscribe to.
`streamPartition` | `number` | Partition id to subscribe to. Optional, defaults to 0.
`sessionToken` | `string` | User's session token retrieved with some authentication method. Optional. Public streams can be subscribed to without authentication.

#### UnsubscribeRequest

Unsubscribes the client from a stream-partition. The response message is `UnsubscribeResponse`.

```
[version, type, streamId, streamPartition]
```
Example:
```
[1, 10, "stream-id", 0]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id to unsubscribe.
`streamPartition` | `number` | Partition id to unsubscribe. Optional, defaults to 0.

#### ResendLastRequest

Requests a resend of the last N messages for a stream-partition. Responses are either a sequence of `ResendResponseResending`, one or more `UnicastMessage`, and a `ResendResponseResent`; or a `ResendResponseNoResend` if there is nothing to resend.

```
[version, type, streamId, streamPartition, subId, numberLast, sessionToken]
```
Example:
```
[1, 11, "streamId", 0, "subId", 500, "my-session-token"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id of the messages to resend.
`streamPartition` | `number` | Partition id of the messages to resend. Optional, defaults to 0.
`subId` | `string` | Subscription id requesting the resend. Randomly generated by the sender.
`numberLast` | `number` | Resend the latest `numberLast` messages.
`sessionToken` | `string` | User's session token retrieved with some authentication method. Not required for public streams.

#### ResendFromRequest

Requests a resend, for a subscription id, of all messages of a particular publisher on a stream-partition, starting from a particular message defined by its reference. It carries a `MessageRef` payload at the Message Layer level, its array representation is described in the [MessageRef](#messageref) section. Responses are either a sequence of `ResendResponseResending`, one or more `UnicastMessage`, and a `ResendResponseResent`; or a `ResendResponseNoResend` if there is nothing to resend.

```
[version, type, streamId, streamPartition, subId, fromMsgRef, publisherId, sessionToken]
```
Example:
```
[1, 12, "streamId", 0, "subId", [...msgRefFields], "publisherId", "my-session-token"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id of the messages to resend.
`streamPartition` | `number` | Partition id of the messages to resend. Optional, defaults to 0.
`subId` | `string` | Subscription id requesting the resend.
`msgRef` | MessageRef | The array representation of the `MessageRef` to resend from. Defined in the Message Layer.
`publisherId` | `string` | The publisher id of the messages to resend. Can be `null` to resend the messages of all publishers.
`sessionToken` | `string` | User's session token retrieved with some authentication method. Not required for public streams.

#### ResendRangeRequest

Requests a resend, for a subscription id, of a range of messages of a particular publisher on a stream-partition between two message references. It carries two `MessageRef` payloads at the Message Layer level, described in the [MessageRef](#messageref) section. Responses are either a sequence of `ResendResponseResending`, one or more `UnicastMessage`, and a `ResendResponseResent`; or a `ResendResponseNoResend` if there is nothing to resend.

```
[version, type, streamId, streamPartition, subId, fromMsgRef, toMsgRef, publisherId, sessionToken]
```
Example:
```
[1, 13, "streamId", 0, "subId", [...fromMsgRefFields], [...toMsgRefFields], "publisherId", "my-session-token"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id of the messages to resend.
`streamPartition` | `number` | Partition id of the messages to resend. Optional, defaults to 0.
`subId` | `string` | Subscription id requesting the resend. Randomly generated by the sender.
`fromMsgRef` | MessageRef | The array representation of the `MessageRef` of the first message to resend. Defined in the Message Layer.
`toMsgRef` | MessageRef | The array representation of the `MessageRef` of the last message to resend. Defined in the Message Layer.
`publisherId` | `string` | The publisher id of the messages to resend. Can be `null` to resend the messages of all publishers.
`sessionToken` | `string` | User's session token retrieved with some authentication method. Not required for public streams.

### Responses sent

#### BroadcastMessage

A message addressed to all subscriptions listening on the stream. It contains a `StreamMessage` as a payload at the Message Layer level. The `StreamMessage` representation is also an array (nested in the `BroadcastMessage` array) which is described in the [StreamMessage](#streammessage) section.

```
[version, type, streamMessage]
```
Example:
```
[1, 0, [...streamMessageFields]]
```

Field    | Type | Description
-------- | ---- | --------
`streamMessage` | StreamMessage | The array representation of the `StreamMessage` to be broadcast. Defined in the Message Layer.

#### UnicastMessage

A message addressed to a specific subscription. It contains a `StreamMessage` as a payload at the Message Layer level. The `StreamMessage` representation is also an array (nested in the `UnicastMessage` array) which is described in the [StreamMessage](#streammessage) section.

```
[version, type, subId, streamMessage]
```
Example:
```
[1, 1, "sub-id", [...streamMessageFields]]
```

Field    | Type | Description
-------- | ---- | --------
`subId` | `string` | The subscription id to deliver the message to. Corresponds to the subscription id sent in a `ResendLastRequest`, a `ResendRangeRequest` or a `ResendFromRequest`.
`streamMessage` | StreamMessage | The array representation of the `StreamMessage` to be delivered. Defined in the Message Layer.

#### SubscribeResponse

Sent in response to a `SubscribeRequest`. Lets the client know that streams were subscribed to.

```
[version, type, streamId, streamPartition]
```
Example:
```
[1, 2, "stream-id", 0]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id subscribed.
`streamPartition` | `number` | Partition id subscribed. Optional, defaults to 0.

#### UnsubscribeResponse

Sent in response to an `UnsubscribeRequest`.

```
[version, type, streamId, streamPartition]
```
Example:
```
[1, 3, "stream-id", 0]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id unsubscribed.
`streamPartition` | `number` | Partition id unsubscribed. Optional, defaults to 0.

#### ResendResponseResending

Sent in response to a `ResendRequest`. Informs the client that a resend is starting.

```
[version, type, streamId, streamPartition, subId]
```
Example:
```
[1, 4, "stream-id", 0, "subId"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId`| `string` | Stream id to resend on.
`streamPartition` | `number` | Partition id to resend on. Optional, defaults to 0.
`subId` | `string` | Subscription id for which the resend is starting. Corresponds to the subscription id sent in a `ResendLastRequest`, a `ResendRangeRequest` or a `ResendFromRequest`.

#### ResendResponseResent

Informs the client that a resend for a particular subscription is complete.

```
[version, type, streamId, streamPartition, subId]
```
Example:
```
[1, 5, "stream-id", 0, "sub-id"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id of the completed resend.
`streamPartition` | `number` | Partition id of the completed resend. Optional, defaults to 0.
`subId` | `string` | Subscription id for which the resend is complete. Corresponds to the subscription id sent in a `ResendLastRequest`, a `ResendRangeRequest` or a `ResendFromRequest`.

#### ResendResponseNoResend

Sent in response to a `ResendRequest`. Informs the client that there was nothing to resend.

```
[version, type, streamId, streamPartition, subId]
```
Example:
```
[1, 6, "stream-id", 0, "subId"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id of resend not executed.
`streamPartition` | `number` | Partition id of the resend not executed. Optional, defaults to 0.
`subId` | `string` | Subscription id for which there is no resend. Corresponds to the subscription id sent in a `ResendLastRequest`, a `ResendRangeRequest` or a `ResendFromRequest`.

#### ErrorResponse

Sent in case of an error.

```
[version, type, errorMessage]
```
Example:
```
[1, 7, "error-message"]
```

Field    | Type | Description
-------- | ---- | --------
`errorMessage` | `string` | Message of the error.

## Message Layer

The Message Layer contains three different types: `MessageID`, `MessageRef` and `StreamMessage`.

### StreamMessage

Contains the data and metadata for a message produced/consumed on a stream. It is a payload at the Control Layer for the following message types: `PublishRequest`, `BroadcastMessage`, `UnicastMessage`. Where `msgId` uniquely identifies the `StreamMessage` and is the array representation of the `MessageID` defined [below](#messageid). `prevMsgRef` allows to identify the previous `StreamMessage` on the same stream and same partition published by the same producer. It is used to detect missing messages. It is the array representation of the `MessageRef` defined [below](#messageref).

```
[version, msgId, prevMsgRef, contentType, content, signatureType, signature]
```
Example:
```
[30, [...msgIdFields], [...msgRefFields], 27, "contentData", 1, "0x29c057786Fa..."]
```

Field    | Type | Description
-------- | ---- | --------
`version` | `number` | Is currently 30.
`msgId` | MessageID |Array representation of the `MessageID` to uniquely identify this message. 
`prevMsgRef` | MessageRef | Array representation of the `MessageRef` of the previous message on a message chain (defined in the `msgId`). Used to detect missing messages.
`contentType` | `number` | Determines how the content should be parsed according to the table below.
`content` | `string` | Content data of the message.
`signatureType` | `number` | Signature type as defined by the table below.
`signature` | `string` | Signature of the message, signed by the producer. Encoding depends on the signature type.

Content Type | Description
-------------- | --------
27 | JSON content. The `content` can either be a JSON string to be parsed or a JSON object.

Signature Type | Name | Description | Signature payload fields to be concatenated in order
-------------- | ---- |------------ | -----------------------
0 | `NONE` | No signature. signature field is empty in this case. | None.
1 | `ETH_LEGACY` | Ethereum signature produced by old clients (Message Layer version 29). The signature field is encoded as a hex string. | `streamId`, `streamPartition`, `timestamp`, `publisherId`, `content`
2 | `ETH` | Ethereum signature produced by current clients (Message Layer version 30). The signature field is encoded as a hex string. | all the `msgId` fields, (`streamId`, `streamPartition`, `timestamp`, `sequenceNumber`, `publisherId`, `msgChainId`), `prevMsgRef`, `content`

### MessageID

Uniquely identifies a `StreamMessage`.

```
[streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId]
```
Example:
```
["stream-id", 0, 425354887214, 0, "0xAd23Ba54d26D3f0Ac057...", "msg-chain-id"]
```

Field    | Type | Description
-------- | ---- | --------
`streamId` | `string` | Stream id the corresponding `StreamMessage` belongs to.
`streamPartition` | `number` | Stream partition the `StreamMessage` belongs to.
`timestamp` | `number` | Timestamp of the `StreamMessage` (milliseconds format).
`sequenceNumber` | `number` | Sequence number of the `StreamMessage` within the same timestamp. Defaults to 0.
`publisherId` | `string` | Id of the publisher of the `StreamMessage`. Must be an Ethereum address if the `StreamMessage` has an Ethereum signature (`signatureType` = 1).
`msgChainId` | `string` | Id of the message chain this `StreamMessage` is part of. This message chain id is chosen by the publisher and defined locally for the `streamId`-`streamPartition`-`publisherId` triplet.

### MessageRef

Used inside a `StreamMessage` to identify the previous message on the same `msgChainId` (defined above).

```
[timestamp, sequenceNumber]
```
Example:
```
[425354887001, 0]
```

Field    | Type | Description
-------- | ---- | --------
`timestamp` | `number` | Timestamp of the `StreamMessage` published on the same stream and same partition by the same producer.
`sequenceNumber` | `number` | Sequence Number of the `StreamMessage`.
