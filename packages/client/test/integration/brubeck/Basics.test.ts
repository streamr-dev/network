import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, Msg } from '../../utils'
import { BrubeckClient } from '../../../src/brubeck/BrubeckClient'
import Connection from '../../../src/Connection'
import { publishManyGenerator } from './utils'

import clientOptions from '../config'
import { Stream } from '../../../src/stream'

describeRepeats('StreamrClient', () => {
    const MAX_MESSAGES = 10
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: BrubeckClient
    // const trackerPort = useTracker()

    const createClient = (opts: any = {}) => {
        const c = new BrubeckClient({
            ...clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
            // network: {
            // trackers: [
            // `ws://127.0.0.1:${trackerPort}`,
            // ],
            // ...opts.network,
            // },
        })
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
    })

    afterEach(async () => {
        await wait(0)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    let stream: Stream

    const createStream = async ({ ...opts } = {}) => {
        const id = `/${uid('stream')}`
        const s = await client.client.createStream({
            id,
            ...opts,
        })
        // await s.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        expect(s.id).toBeTruthy()
        return s
    }

    beforeEach(async () => {
        client = createClient()
        await client.getSessionToken()
        client.debug('create stream >>')
        stream = await createStream()
        client.debug('create stream <<')
        expect(onError).toHaveBeenCalledTimes(0)
    })

    afterEach(async () => {
        await wait(0)
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
    })

    afterEach(async () => {
        await wait(0)

        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }
    })

    describe('Pub/Sub', () => {
        it('can successfully pub/sub 1 message', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const testMsg = Msg()
            await client.publish(stream.id, testMsg)
            const received = []
            for await (const msg of sub) {
                received.push(msg.getParsedContent())
                if (received.length === 1) {
                    break
                }
            }
            expect(received).toEqual([testMsg])
        })

        it('can successfully pub/sub multiple messages', async () => {
            const sub = await client.subscribe({
                streamId: stream.id,
            })
            const source = publishManyGenerator(MAX_MESSAGES, { timestamp: 1111111 })
            const published = await client.publisher.collect(client.publisher.publishFromMetadata(stream, source), MAX_MESSAGES)
            const received = []
            for await (const msg of sub) {
                received.push(msg)
                if (received.length === published.length) {
                    break
                }
            }

            expect(received.map((s) => s.getParsedContent())).toEqual(published.map((s) => s.getParsedContent()))
            expect(received.map((streamMessage) => streamMessage.getTimestamp())).toEqual(published.map(() => 1111111))
        })
    })
})
