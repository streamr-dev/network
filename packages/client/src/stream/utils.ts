/**
 * Utilities shared between publish & subscribe
 */

import { inspect } from 'util'

import { ControlLayer } from 'streamr-client-protocol'

import { pTimeout } from '../utils'
import { EthereumAddress, Todo } from '../types'
import { StreamrClient } from '../StreamrClient'
import { StreamPartDefinition, ValidatedStreamPartDefinition } from '.'

export function StreamKey({ streamId, streamPartition = 0 }: Todo) {
    if (streamId == null) { throw new Error(`StreamKey: invalid streamId (${typeof streamId}): ${streamId}`) }

    if (!Number.isInteger(streamPartition) || streamPartition < 0) {
        throw new Error(`StreamKey: invalid streamPartition (${typeof streamPartition}): ${streamPartition}`)
    }
    return `${streamId}::${streamPartition}`
}

export function validateOptions<U>(optionsOrStreamId: StreamPartDefinition): ValidatedStreamPartDefinition & U {
    if (!optionsOrStreamId) {
        throw new Error('streamId is required!')
    }

    // Backwards compatibility for giving a streamId as first argument
    let options: Todo = {}
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
                ...(validateOptions(stream) as ValidatedStreamPartDefinition),
            })
        }

        if (optionsOrStreamId.id != null && optionsOrStreamId.streamId == null) {
            options.streamId = optionsOrStreamId.id
        }

        if (optionsOrStreamId.partition != null && optionsOrStreamId.streamPartition == null) {
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
}: Todo) {
    let callError: Error | undefined = new Error('waitForMatchingMessage Error')
    if (typeof matchFn !== 'function') {
        throw new Error(`matchFn required, got: (${typeof matchFn}) ${matchFn}`)
    }

    await connection.nextConnection()
    let done: (err?: Error, value?: any) => void = () => {}

    const matchTask = new Promise((resolve, reject) => {
        const tryMatch = (...args: Todo[]) => {
            try {
                return matchFn(...args)
            } catch (err) {
                done(err)
                return false
            }
        }

        const onResponse = (res: Todo) => {
            if (!tryMatch(res)) { return }
            // clean up err handler
            done(undefined, res)
        }

        const onErrorResponse = (res: Todo) => {
            if (!tryMatch(res)) { return }
            // clean up success handler
            const error = callError || new Error('waitForMatchingMessage Error')
            error.message += `: ${res.errorMessage}`
            // @ts-expect-error
            error.code = res.errorCode
            done(error)
        }

        let onDisconnected: Todo
        done = (err?: Error, value?: any) => {
            callError = undefined
            // eslint-disable-next-line promise/no-promise-in-callback
            if (cancelTask) { cancelTask.catch(() => {}) } // ignore cancel errors

            connection.off('disconnected', onDisconnected)
            connection.off('done', onDisconnected)
            connection.off(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
            types.forEach((type: Todo) => {
                connection.off(type, onResponse)
            })

            if (err) {
                reject(err)
            } else {
                resolve(value)
            }
        }

        onDisconnected = () => done()
        connection.once('disconnected', onDisconnected)
        connection.once('done', onDisconnected)

        types.forEach((type: Todo) => {
            connection.on(type, onResponse)
        })

        connection.once(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
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
        done()
    }
}

/**
 * Wait for matching response types to requestId, or ErrorResponse.
 */

export async function waitForResponse({ requestId, timeoutMessage = `Waiting for response to: ${requestId}.`, ...opts }: Todo) {
    if (requestId == null) {
        throw new Error(`requestId required, got: (${typeof requestId}) ${requestId}`)
    }

    return waitForMatchingMessage({
        ...opts,
        requestId,
        timeoutMessage,
        matchFn(res: Todo) {
            return res.requestId === requestId
        }
    })
}

export async function waitForRequestResponse(client: StreamrClient, request: Todo, opts: Todo = {}) {
    return waitForResponse({
        connection: client.connection,
        types: PAIRS.get(request.type),
        requestId: request.requestId,
        ...opts, // e.g. timeout, rejectOnTimeout
    })
}

export const createStreamId = async (streamIdOrPath: string, ownerProvider?: () => Promise<EthereumAddress|undefined>) => {
    if (streamIdOrPath === undefined) {
        throw new Error('Missing stream id')
    }

    if (!streamIdOrPath.startsWith('/')) {
        return streamIdOrPath
    }

    if (ownerProvider === undefined) {
        throw new Error(`Owner provider missing for stream id: ${streamIdOrPath}`)
    }
    const owner = await ownerProvider()
    if (owner === undefined) {
        throw new Error(`Owner missing for stream id: ${streamIdOrPath}`)
    }
    return owner.toLowerCase() + streamIdOrPath
}
