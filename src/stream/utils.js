/**
 * Utilities shared between publish & subscribe
 */

import { inspect } from 'util'

import { ControlLayer } from 'streamr-client-protocol'

import { pTimeout } from '../utils'

export function StreamKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`StreamKey: invalid streamId (${typeof streamId}): ${streamId}`) }

    if (!Number.isInteger(streamPartition) || streamPartition < 0) {
        throw new Error(`StreamKey: invalid streamPartition (${typeof streamPartition}): ${streamPartition}`)
    }
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

    options.streamPartition = options.streamPartition || 0

    options.key = StreamKey(options)

    return options
}

const { ControlMessage } = ControlLayer

const ResendResponses = [ControlMessage.TYPES.ResendResponseResending, ControlMessage.TYPES.ResendResponseNoResend]

export const STREAM_MESSAGE_TYPES = [ControlMessage.TYPES.UnicastMessage, ControlMessage.TYPES.BroadcastMessage]

const PAIRS = new Map([
    [ControlMessage.TYPES.SubscribeRequest, [ControlMessage.TYPES.SubscribeResponse]],
    [ControlMessage.TYPES.UnsubscribeRequest, [ControlMessage.TYPES.UnsubscribeResponse]],
    [ControlMessage.TYPES.ResendLastRequest, ResendResponses],
    [ControlMessage.TYPES.ResendFromRequest, ResendResponses],
    [ControlMessage.TYPES.ResendRangeRequest, ResendResponses],
])

export async function waitForMatchingMessage({
    connection,
    matchFn,
    timeout,
    types = [],
    rejectOnTimeout = true,
    timeoutMessage,
    cancelTask,
}) {
    if (typeof matchFn !== 'function') {
        throw new Error(`matchFn required, got: (${typeof matchFn}) ${matchFn}`)
    }

    await connection.nextConnection()
    let cleanup = () => {}

    const matchTask = new Promise((resolve, reject) => {
        const tryMatch = (...args) => {
            try {
                return matchFn(...args)
            } catch (err) {
                cleanup()
                reject(err)
                return false
            }
        }
        let onDisconnected
        const onResponse = (res) => {
            if (!tryMatch(res)) { return }
            // clean up err handler
            cleanup()
            resolve(res)
        }

        const onErrorResponse = (res) => {
            if (!tryMatch(res)) { return }
            // clean up success handler
            cleanup()
            const error = new Error(res.errorMessage)
            error.code = res.errorCode
            reject(error)
        }

        cleanup = () => {
            if (cancelTask) { cancelTask.catch(() => {}) } // ignore
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

    try {
        const task = cancelTask ? Promise.race([
            matchTask,
            cancelTask,
        ]) : matchTask

        if (!timeout) {
            return await task
        }

        return await pTimeout(task, {
            timeout,
            message: timeoutMessage,
            rejectOnTimeout,
        })
    } finally {
        cleanup()
    }
}

/**
 * Wait for matching response types to requestId, or ErrorResponse.
 */

export async function waitForResponse({ requestId, timeoutMessage = `Waiting for response to: ${requestId}.`, ...opts }) {
    if (requestId == null) {
        throw new Error(`requestId required, got: (${typeof requestId}) ${requestId}`)
    }

    return waitForMatchingMessage({
        ...opts,
        requestId,
        timeoutMessage,
        matchFn(res) {
            return res.requestId === requestId
        }
    })
}

export async function waitForRequestResponse(client, request, opts = {}) {
    return waitForResponse({
        connection: client.connection,
        types: PAIRS.get(request.type),
        requestId: request.requestId,
        ...opts, // e.g. timeout, rejectOnTimeout
    })
}
