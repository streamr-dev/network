import { wait } from 'streamr-test-utils'

import { describeRepeats, fakePrivateKey, uid, getPublishTestMessages, addAfterFn } from '../utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream, StreamOperation } from '../../src/stream'
import { GroupKey } from '../../src/stream/encryption/Encryption'
import Connection from '../../src/Connection'

import config from './config'

const TIMEOUT = 10 * 1000

describeRepeats('Encryption Key Persistence', () => {
    let expectErrors = 0 // check no errors by default
    let errors: Error[] = []
    let onError = jest.fn()
    const getOnError = (errs: Error[]) => jest.fn((err) => {
        errs.push(err)
    })

    let publisher: StreamrClient
    let subscriber: StreamrClient
    let stream: Stream
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>
    const addAfter = addAfterFn()

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // @ts-expect-error
            disconnectDelay: 1,
            publishAutoDisconnectDelay: 50,
            maxRetries: 2,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)

        return c
    }

    beforeEach(() => {
        errors = []
        expectErrors = 0
        onError = getOnError(errors)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(errors).toHaveLength(expectErrors)
        if (publisher) {
            expect(publisher.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(0)
        if (publisher) {
            publisher.debug('disconnecting after test')
            await publisher.disconnect()
        }

        if (subscriber) {
            subscriber.debug('disconnecting after test')
            await subscriber.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    let publisherPrivateKey: string
    let subscriberPrivateKey: string

    async function setupPublisher(opts?: any) {
        const client = createClient(opts)
        await Promise.all([
            client.session.getSessionToken(),
            client.connect(),
        ])

        const name = uid('stream')
        stream = await client.createStream({
            name,
            requireEncryptedData: true,
        })

        await stream.addToStorageNode(config.clientOptions.storageNode.address)

        publishTestMessages = getPublishTestMessages(client, {
            stream,
            waitForLast: true,
        })
        return client
    }

    beforeEach(async () => {
        publisherPrivateKey = fakePrivateKey()
        publisher = await setupPublisher({
            id: 'publisher',
            auth: {
                privateKey: publisherPrivateKey,
            }
        })
        subscriberPrivateKey = fakePrivateKey()
        subscriber = createClient({
            id: 'subscriber',
            autoConnect: true,
            autoDisconnect: true,
            auth: {
                privateKey: subscriberPrivateKey,
            }
        })
        const otherUser = await subscriber.getUserInfo()
        await stream.grantPermission(StreamOperation.STREAM_GET, otherUser.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, otherUser.username)
        const groupKey = GroupKey.generate()
        await publisher.setNextGroupKey(stream.id, groupKey)
    })

    describe('publisher persists group key', () => {
        let published: any[]
        let publisher2: StreamrClient
        beforeEach(async () => {
            // ensure publisher can read a persisted group key
            // 1. publish some messages with publisher
            // 2. then disconnect publisher
            // 3. create new publisher with same key
            // 4. subscribe with subscriber
            // because original publisher is disconnected
            // subscriber will need to ask new publisher
            // for group keys, which the new publisher will have to read from
            // persistence
            published = await publishTestMessages(5)
            await publisher.disconnect()
            publisher2 = createClient({
                id: 'publisher2',
                auth: {
                    privateKey: publisherPrivateKey,
                }
            })

            addAfter(async () => {
                await publisher2.disconnect()
            })

            await publisher2.connect()
        }, 2 * TIMEOUT)

        it('works', async () => {
            // TODO: this should probably happen automatically if there are keys
            // also probably needs to create a connection handle
            await publisher2.publisher.startKeyExchange()

            const sub = await subscriber.subscribe({
                stream: stream.id,
                resend: {
                    last: 5,
                }
            })
            const received = []
            for await (const m of sub) {
                received.push(m.getParsedContent())
                if (received.length === published.length) {
                    break
                }
            }

            expect(received).toEqual(published)
        }, 2 * TIMEOUT)
    })

    it('subscriber persists group key', async () => {
        // we want to check that subscriber can read a group key
        // persisted by another subscriber:
        // 1. create publisher and subscriber
        // 2. after subscriber gets first message
        // 3. disconnect both subscriber and publisher
        // 4. then create a new subscriber with same key as original subscriber
        // 5. and subscribe to same stream.
        // this should pick up group key persisted by first subscriber
        // publisher is disconnected, so can't ask for new group keys
        const sub = await subscriber.subscribe({
            stream: stream.id,
        })
        const published = await publishTestMessages(5)

        const received = []
        for await (const m of sub) {
            received.push(m.getParsedContent())
            if (received.length === 1) {
                break
            }
        }
        await subscriber.disconnect()
        await publisher.disconnect()

        const subscriber2 = createClient({
            id: 'subscriber2',
            auth: {
                privateKey: subscriberPrivateKey
            }
        })

        addAfter(async () => {
            await subscriber2.disconnect()
        })

        await subscriber2.connect()
        const sub2 = await subscriber2.subscribe({
            stream: stream.id,
            resend: {
                last: 5
            }
        })

        const received2 = []
        for await (const m of sub2) {
            received2.push(m.getParsedContent())
            if (received2.length === published.length) {
                break
            }
        }
        expect(received2).toEqual(published)
        expect(received).toEqual(published.slice(0, 1))
    }, 2 * TIMEOUT)

    it('can run multiple publishers in parallel', async () => {
        const sub = await subscriber.subscribe({
            stream: stream.id,
        })

        // ensure publishers don't clobber each others data
        const publisher2 = createClient({
            id: 'publisher2',
            auth: {
                privateKey: publisherPrivateKey,
            }
        })

        addAfter(async () => {
            await publisher2.disconnect()
        })

        await publisher2.connect()
        const publishTestMessages2 = getPublishTestMessages(publisher2, {
            stream,
            waitForLast: true,
        })
        const MAX_MESSAGES = 16
        const [published1, published2] = await Promise.all([
            publishTestMessages(MAX_MESSAGES - 1),
            publishTestMessages2(MAX_MESSAGES), // use different lengths so we can differentiate who published what
        ])

        const received1 = []
        const received2 = []
        for await (const m of sub) {
            const content = m.getParsedContent()
            // 'n of MAX_MESSAGES' messages belong to publisher2
            if (content.value.endsWith(`of ${MAX_MESSAGES}`)) {
                received2.push(content)
            } else {
                received1.push(content)
            }

            if (received1.length === published1.length && received2.length === published2.length) {
                break
            }
        }

        expect(received1).toEqual(published1)
        expect(received2).toEqual(published2)
    }, 2 * TIMEOUT)
})
