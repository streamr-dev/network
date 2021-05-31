import fs from 'fs'
import path from 'path'

import { MessageLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { describeRepeats, uid, fakePrivateKey, getWaitForStorage, getPublishTestMessages, Msg } from '../utils'
import { BrubeckClient } from '../../src/brubeck/BrubeckClient'
import { Defer } from '../../src/utils'
import Connection from '../../src/Connection'

import config from './config'
import { Stream } from '../../src/stream'
import { Subscription } from '../../src'
import { StorageNode } from '../../src/stream/StorageNode'

const { StreamMessage } = MessageLayer

const MAX_MESSAGES = 10

describeRepeats('StreamrClient', () => {
    let expectErrors = 0 // check no errors by default
    let errors: any[] = []

    const getOnError = (errs: any) => jest.fn((err) => {
        errs.push(err)
    })

    let onError = jest.fn()
    let client: BrubeckClient

    const createClient = (opts = {}) => {
        const c = new BrubeckClient({
            ...config.clientOptions,
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            // disconnectDelay: 500,
            // publishAutoDisconnectDelay: 250,
            maxRetries: 2,
            ...opts,
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
    let waitForStorage: (...args: any[]) => Promise<void>
    let publishTestMessages: ReturnType<typeof getPublishTestMessages>

    // These tests will take time, especially on Travis
    const TIMEOUT = 30 * 1000
    const WAIT_TIME = 600

    const createStream = async ({ requireSignedData = true, ...opts } = {}) => {
        const name = uid('stream')
        const s = await client.client.createStream({
            name,
            requireSignedData,
            ...opts,
        })
        await s.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)

        expect(s.id).toBeTruthy()
        expect(s.name).toEqual(name)
        expect(s.requireSignedData).toBe(requireSignedData)
        return s
    }

    beforeEach(async () => {
        client = createClient()
        await Promise.all([
            client.getSessionToken(),
            client.connect(),
        ])
        stream = await createStream()
        publishTestMessages = getPublishTestMessages(client.client, {
            stream,
        })
        waitForStorage = getWaitForStorage(client.client, {
            stream,
        })
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

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            await Connection.closeOpen()
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('Pub/Sub', () => {
        it('can successfully publish', async () => {
            await client.client.connect()
            const sub = await client.client.subscribe({
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
        }, TIMEOUT)

    })
})
