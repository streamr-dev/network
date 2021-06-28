import {
    StreamMessage, Errors
} from 'streamr-client-protocol'

import { GroupKey, GroupKeyish } from './Encryption'
import { StreamrClient } from '../../StreamrClient'

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

export const { ValidationError } = Errors

export function isKeyExchangeStream(id = '') {
    return id.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

/*
class InvalidGroupKeyResponseError extends Error {
    constructor(...args) {
        super(...args)
        this.code = 'INVALID_GROUP_KEY_RESPONSE'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

class InvalidContentTypeError extends Error {
    constructor(...args) {
        super(...args)
        this.code = 'INVALID_MESSAGE_TYPE'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
*/

type Address = string
export type GroupKeyId = string

export function getKeyExchangeStreamId(address: Address) {
    if (isKeyExchangeStream(address)) {
        return address // prevent ever double-handling
    }
    return `${KEY_EXCHANGE_STREAM_PREFIX}/${address.toLowerCase()}`
}

export type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

export function parseGroupKeys(groupKeys: GroupKeysSerialized = {}): Map<GroupKeyId, GroupKey> {
    return new Map<GroupKeyId, GroupKey>(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean) as [])
}

export async function subscribeToKeyExchangeStream<T>(
    client: StreamrClient,
    onKeyExchangeMessage: (msg: T, streamMessage: StreamMessage<T>) => void
) {
    const { options } = client
    if ((!options.auth!.privateKey && !options.auth!.ethereum) || !options.keyExchange) {
        return Promise.resolve()
    }

    await client.session.getSessionToken() // trigger auth errors if any
    // subscribing to own keyexchange stream
    const publisherId = await client.getUserId()
    const streamId = getKeyExchangeStreamId(publisherId)
    const sub = await client.subscribe(streamId, onKeyExchangeMessage)
    sub.on('error', () => {}) // errors should not shut down subscription
    return sub
}

export type KeyExchangeOptions = {
    groupKeys?: Record<string, GroupKeysSerialized>
}
