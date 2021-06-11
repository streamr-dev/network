import { wait, waitForCondition } from 'streamr-test-utils'

import { fakePrivateKey, getPublishTestMessages, createTestStream } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'

import config from './config'
import { Stream } from '../../src/stream'
import { Subscription } from '../../src'
import { PublishRequest } from 'streamr-client-protocol/dist/src/protocol/control_layer'
import { StorageNode } from '../../src/stream/StorageNode'

const createClient = (opts = {}) => new StreamrClient({
    ...config.clientOptions,
    auth: {
        privateKey: fakePrivateKey(),
    },
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
})

const MAX_MESSAGES = 3

describe('resend/reconnect', () => {
    let client: StreamrClient
    let stream: Stream
    let publishedMessages: [message: any, request: PublishRequest][]
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>

    beforeEach(async () => {
        client = createClient()
        await client.connect()

        stream = await createTestStream(client, module)

        await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
    }, 10000)

    beforeEach(async () => {
        publishTestMessages = getPublishTestMessages(client, {
            streamId: stream.id,
            waitForLast: true,
        })

        publishedMessages = await publishTestMessages(MAX_MESSAGES)
    }, 10000)

    afterEach(async () => {
        await client.disconnect()
    })

    describe('reconnect with resend', () => {
        let shouldDisconnect = false
        let sub: Subscription
        let messages: any[] = []

        beforeEach(async () => {
            const done = Defer()
            messages = []
            sub = await client.subscribe({
                streamId: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                messages.push(message)
                if (shouldDisconnect) {
                    client.connection.socket.close()
                }
            })

            sub.once('resent', done.resolve)
            await done
            expect(messages).toEqual(publishedMessages.slice(-MAX_MESSAGES))
        }, 15000)

        it('can handle mixed resend/subscribe', async () => {
            const prevMessages = messages.slice()
            const newMessages = await publishTestMessages(3)
            expect(messages).toEqual([...prevMessages, ...newMessages])
        }, 10000)

        it('can handle reconnection after unintentional disconnection 1', async () => {
            const onClose = Defer()

            client.connection.socket.once('close', onClose.resolve)
            client.connection.socket.close()
            await onClose
            // should reconnect and get new messages
            const prevMessages = messages.slice()
            const newMessages = await publishTestMessages(3)
            await wait(6000)
            expect(messages).toEqual([...prevMessages, ...newMessages])
        }, 11000)

        it('can handle reconnection after unintentional disconnection 2', async () => {
            // should reconnect and get new messages
            const prevMessages = messages.slice()
            const newMessages = await publishTestMessages(3, {
                waitForLast: false,
            })
            const onClose = Defer()

            client.connection.socket.once('close', onClose.resolve)
            client.connection.socket.close()
            await client.connection.nextConnection()

            await wait(6000)
            expect(messages).toEqual([...prevMessages, ...newMessages])
        }, 11000)

        it('can handle reconnection after unintentional disconnection 3', async () => {
            shouldDisconnect = true
            const prevMessages = messages.slice()
            const newMessages = await publishTestMessages(MAX_MESSAGES, {
                waitForLast: false,
            })
            await waitForCondition(() => messages.length === MAX_MESSAGES * 2, 10000)
            expect(messages).toEqual([...prevMessages, ...newMessages])
        }, 21000)
    })
})
