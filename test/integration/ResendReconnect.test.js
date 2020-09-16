import { wait } from 'streamr-test-utils'

import { uid, fakePrivateKey } from '../utils'
import StreamrClient from '../../src'

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

    beforeEach(async () => {
        client = createClient()
        await client.ensureConnected()

        publishedMessages = []

        stream = await client.createStream({
            name: uid('resends')
        })

        for (let i = 0; i < MAX_MESSAGES; i++) {
            const message = {
                msg: uid('message'),
            }

            // eslint-disable-next-line no-await-in-loop
            await client.publish(stream.id, message)
            publishedMessages.push(message)
        }

        await wait(5000) // wait for messages to (hopefully) land in storage
    }, 10 * 1000)

    afterEach(async () => {
        await client.ensureDisconnected()
    })

    describe('reconnect after resend', () => {
        let sub
        let messages = []
        beforeEach(async (done) => {
            sub = await client.subscribe({
                stream: stream.id,
                resend: {
                    last: MAX_MESSAGES,
                },
            }, (message) => {
                messages.push(message)
            })
            sub.once('resent', () => {
                done()
            })
        }, 15000)

        it('can handle reconnection after disconnection', (done) => {
            const newPublishedMessages = []
            client.connection.socket.once('close', () => {
                // should reconnect
                client.once('connected', async () => {
                    setTimeout(async () => {
                        // clear messsages
                        messages = []
                        const message = {
                            msg: uid('newmessage'),
                        }
                        newPublishedMessages.push(message)
                        await client.publish(stream, message)
                        setTimeout(() => {
                            expect(messages).toEqual(newPublishedMessages)
                            done()
                        }, 3000)
                    }, 3000)
                })
            })
            client.connection.socket.close()
        }, 110000)
    })
})

