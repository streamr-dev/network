import { wait, waitForCondition } from 'streamr-test-utils'

import { uid, fakePrivateKey, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import { Defer } from '../../src/utils'

import config from './config'

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: fakePrivateKey(),
    },
    autoConnect: false,
    autoDisconnect: false,
    ...(config.clientOptions || {
        url: config.websocketUrl,
        restUrl: config.restUrl,
    }),
    ...opts,
})

const MAX_MESSAGES = 3

describe('resend/reconnect', () => {
    let client
    let stream
    let publishedMessages
    let publishTestMessages

    beforeEach(async () => {
        client = createClient()
        await client.connect()

        stream = await client.createStream({
            name: uid('resends')
        })

        publishTestMessages = getPublishTestMessages(client, {
            streamId: stream.id,
            waitForLast: true,
        })

        publishedMessages = await publishTestMessages(MAX_MESSAGES)
        client.enableAutoConnect()
    }, 10 * 1000)

    afterEach(async () => {
        await client.disconnect()
    })

    describe('reconnect with resend', () => {
        let sub
        let messages = []
        beforeEach(async () => {
            const done = Defer()
            messages = []
            sub = await client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                messages.push(message)
            })
            sub.once('resent', done.resolve)
            await done
            expect(messages).toEqual(publishedMessages.slice(-MAX_MESSAGES))
        }, 15000)

        it('can handle reconnection after unintentional disconnection', async () => {
            const onClose = Defer()
            client.connection.socket.once('close', onClose.resolve)
            client.connection.socket.close()
            await onClose
            // should reconnect and get new messages
            const prevMessages = messages
            const newMessages = await publishTestMessages(3)
            await wait(6000)
            await waitForCondition(() => messages.length === MAX_MESSAGES + 3, 6000)
            expect(messages).toEqual([...prevMessages, ...newMessages])
        }, 110000)
    })
})

