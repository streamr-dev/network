import { inspect } from 'util'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import { uuid } from '../utils'
import { waitForRequestResponse } from '../stream/utils'

const {
    SubscribeRequest, UnsubscribeRequest,
    ResendLastRequest, ResendFromRequest, ResendRangeRequest,
} = ControlcdLayer

const { MessageRef } = MessageLayer

/**
 * Subscribe Request
 */

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

/**
 * Unsubscribe Request
 */

export async function unsubscribe(client, { streamId, streamPartition = 0 }) { // eslint-disable-line no-underscore-dangle
    const { connection } = client

    // disconnection auto-unsubs
    // if already disconnected/disconnecting no need to send unsub
    const needsUnsubscribe = (
        connection.isConnectionValid()
        && !connection.isDisconnected()
        && !connection.isDisconnecting()
    )

    if (!needsUnsubscribe) {
        return Promise.resolve()
    }

    const sessionToken = await client.session.getSessionToken()
    const request = new UnsubscribeRequest({
        streamId,
        streamPartition,
        sessionToken,
        requestId: uuid('unsub'),
    })

    const onResponse = waitForRequestResponse(client, request).catch((err) => {
        // noop if unsubscribe failed because we are already unsubscribed
        if (err.message.contains('Not subscribed to stream')) {
            return
        }

        throw err
    })

    await client.send(request)
    return onResponse
}

/**
 * Resend Request
 */

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
        publisherId
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
            publisherId
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
