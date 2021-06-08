import { ControlLayer } from 'streamr-client-protocol'

import { counterId } from '../utils'
import { validateOptions, waitForResponse } from '../stream/utils'

import { resend } from './api'
import messageStream from './messageStream'
import { StreamrClient } from '../StreamrClient'

const { ControlMessage } = ControlLayer

/**
 * Stream of resent messages.
 * Sends resend request, handles responses.
 */

export default function resendStream(client: StreamrClient, opts = {}, onFinally = async () => {}) {
    const options = validateOptions(opts)
    const { connection } = client
    const requestId = counterId(`${options.key}-resend`)
    // @ts-expect-error doesn't know if options is valid
    const msgStream = messageStream(client.connection, {
        ...options,
        isUnicast: true,
    }, async (...args) => {
        try {
            await connection.removeHandle(requestId)
        } finally {
            await onFinally(...args)
        }
    })

    const onResendDone = waitForResponse({ // eslint-disable-line promise/catch-or-return
        requestId,
        connection: client.connection,
        types: [
            ControlMessage.TYPES.ResendResponseResent,
            ControlMessage.TYPES.ResendResponseNoResend,
        ],
    }).then(() => (
        msgStream.end()
    ), async (err) => {
        await msgStream.cancel(err)
        throw err
    })

    // wait for resend complete message or resend request done
    return Object.assign(msgStream, {
        async subscribe() {
            await connection.addHandle(requestId)
            // wait for resend complete message or resend request done
            let error
            await Promise.race([
                resend(client, {
                    requestId,
                    ...options,
                }).catch((err) => {
                    error = err
                }),
                onResendDone.catch((err) => {
                    error = err
                })
            ])
            if (error) {
                await msgStream.cancel(error)
                throw error
            }
            return this
        },
        async unsubscribe() {
            return msgStream.cancel()
        }
    })
}
