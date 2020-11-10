import { inspect } from 'util'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import { uuid } from '../utils'

const {
    SubscribeRequest, UnsubscribeRequest, ControlMessage,
    ResendLastRequest, ResendFromRequest, ResendRangeRequest,
} = ControlLayer

const { MessageRef } = MessageLayer

export function SubKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`SubKey: invalid streamId: ${streamId} ${streamPartition}`) }
    return `${streamId}::${streamPartition}`
}

export function validateOptions(optionsOrStreamId) {
    if (!optionsOrStreamId) {
        throw new Error('options is required!')
    }

    // Backwards compatibility for giving a streamId as first argument
    let options = {}
    if (typeof optionsOrStreamId === 'string') {
        options = {
            streamId: optionsOrStreamId,
            streamPartition: 0,
        }
    } else if (typeof optionsOrStreamId === 'object') {
        if (optionsOrStreamId.stream) {
            const { stream, ...other } = optionsOrStreamId
            return validateOptions({
                ...other,
                ...validateOptions(stream),
            })
        }

        if (optionsOrStreamId.id != null && optionsOrStreamId.streamId == null) {
            options.streamId = optionsOrStreamId.id
        }

        if (optionsOrStreamId.partition == null && optionsOrStreamId.streamPartition == null) {
            options.streamPartition = optionsOrStreamId.partition
        }

        // shallow copy
        options = {
            streamPartition: 0,
            ...options,
            ...optionsOrStreamId
        }
    } else {
        throw new Error(`options must be an object! Given: ${inspect(optionsOrStreamId)}`)
    }

    if (options.streamId == null) {
        throw new Error(`streamId must be set! Given: ${inspect(optionsOrStreamId)}`)
    }

    options.key = SubKey(options)

    return options
}

const ResendResponses = [ControlMessage.TYPES.ResendResponseResending, ControlMessage.TYPES.ResendResponseNoResend]

const PAIRS = new Map([
    [ControlMessage.TYPES.SubscribeRequest, [ControlMessage.TYPES.SubscribeResponse]],
    [ControlMessage.TYPES.UnsubscribeRequest, [ControlMessage.TYPES.UnsubscribeResponse]],
    [ControlMessage.TYPES.ResendLastRequest, ResendResponses],
    [ControlMessage.TYPES.ResendFromRequest, ResendResponses],
    [ControlMessage.TYPES.ResendRangeRequest, ResendResponses],
])

/**
 * Wait for matching response types to requestId, or ErrorResponse.
 */

export async function waitForResponse({ connection, types, requestId }) {
    await connection.nextConnection()
    return new Promise((resolve, reject) => {
        let cleanup
        let onDisconnected
        const onResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up err handler
            cleanup()
            resolve(res)
        }

        const onErrorResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up success handler
            cleanup()
            const error = new Error(res.errorMessage)
            error.code = res.errorCode
            reject(error)
        }

        cleanup = () => {
            connection.off('disconnected', onDisconnected)
            connection.off(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
            types.forEach((type) => {
                connection.off(type, onResponse)
            })
        }

        types.forEach((type) => {
            connection.on(type, onResponse)
        })
        connection.on(ControlMessage.TYPES.ErrorResponse, onErrorResponse)

        onDisconnected = () => {
            cleanup()
            resolve() // noop
        }

        connection.once('disconnected', onDisconnected)
    })
}

async function waitForRequestResponse(client, request) {
    return waitForResponse({
        connection: client.connection,
        types: PAIRS.get(request.type),
        requestId: request.requestId,
    })
}

//
// Subscribe/Unsubscribe
//

export async function subscribe(client, { streamId, streamPartition = 0 }) {
    const sessionToken = await client.session.getSessionToken()
    const request = new SubscribeRequest({
        streamId,
        streamPartition,
        sessionToken,
        requestId: uuid('sub'),
    })

    const onResponse = waitForRequestResponse(client, request)

    await client.send(request)
    return onResponse
}

async function _unsubscribe(client, { streamId, streamPartition = 0 }) { // eslint-disable-line no-underscore-dangle
    const sessionToken = await client.session.getSessionToken()
    const request = new UnsubscribeRequest({
        streamId,
        streamPartition,
        sessionToken,
        requestId: uuid('unsub'),
    })

    const onResponse = waitForRequestResponse(client, request).catch((err) => {
        if (err.message.contains('Not subscribed to stream')) {
            // noop if unsubscribe failed because we are already unsubscribed
            return
        }
        throw err
    })

    await client.send(request)
    return onResponse
}

export async function unsubscribe(client, ...args) {
    // disconnection auto-unsubs, so if already disconnected/disconnecting no need to send unsub
    const { connection } = client
    if (
        connection.isConnectionValid()
        && !connection.isDisconnected()
        && !connection.isDisconnecting()) {
        return _unsubscribe(client, ...args)
    }

    return Promise.resolve()
}

//
// Resends
//

function createResendRequest(resendOptions) {
    const {
        requestId = uuid('rs'),
        streamId,
        streamPartition = 0,
        sessionToken,
        ...options
    } = resendOptions

    const {
        from,
        to,
        last,
        publisherId,
        msgChainId,
    } = {
        ...options,
        ...options.resend
    }

    const commonOpts = {
        streamId,
        streamPartition,
        requestId,
        sessionToken,
    }

    let request

    if (last > 0) {
        request = new ResendLastRequest({
            ...commonOpts,
            numberLast: last,
        })
    } else if (from && !to) {
        request = new ResendFromRequest({
            ...commonOpts,
            fromMsgRef: new MessageRef(from.timestamp, from.sequenceNumber),
            publisherId,
            msgChainId,
        })
    } else if (from && to) {
        request = new ResendRangeRequest({
            ...commonOpts,
            fromMsgRef: new MessageRef(from.timestamp, from.sequenceNumber),
            toMsgRef: new MessageRef(to.timestamp, to.sequenceNumber),
            publisherId,
            msgChainId,
        })
    }

    if (!request) {
        throw new Error(`Can't _requestResend without resend options. Got: ${inspect(resendOptions)}`)
    }

    return request
}

export async function resend(client, options) {
    const sessionToken = await client.session.getSessionToken()
    const request = createResendRequest({
        ...options,
        sessionToken,
    })

    const onResponse = waitForRequestResponse(client, request)

    await client.send(request)
    return onResponse
}
