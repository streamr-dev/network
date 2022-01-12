import assert from 'assert'
import { StreamFetcher } from '../../src/StreamFetcher'
import { createClient, createTestStream, getPrivateKey, startTestTracker } from '../utils'
import StreamrClient, { StreamPermission } from 'streamr-client'
import { Wallet } from '@ethersproject/wallet'

jest.setTimeout(30000)

describe('StreamFetcher', () => {
    let streamFetcher: StreamFetcher
    let client: StreamrClient
    let streamId: string

    beforeAll(async() => {

        const tracker = await startTestTracker(29892)
        client = await createClient(tracker, await getPrivateKey(), {})
        streamId = (await createTestStream(client, module)).streamId

        streamFetcher = new StreamFetcher(client)

    })

    describe('checkPermission', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.checkPermission(streamId, await client.getAddress(), StreamPermission.SUBSCRIBE)
            assert(promise instanceof Promise)
            // await promise
        })

        it('rejects with NOT_FOUND if stream does not exist', async () => {
            await streamFetcher.checkPermission('nonExistingStreamId', await client.getAddress(),
                StreamPermission.SUBSCRIBE).catch((err: any) => {
                assert.equal(err.errorCode, 'NOT_FOUND')
            })
        })
        it('rejects with err if address does not grant access to stream', async () => {
            const wallet = Wallet.createRandom()
            streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamPermission.SUBSCRIBE).catch((err: any) => {
                expect(err.message).toContain('does not have permission')
            })
        })

        it('rejects with unauthorized if session token does not provide (desired level) privilege to stream', async () => {
            const wallet = Wallet.createRandom()
            await streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamPermission.PUBLISH).catch((err: any) => {
                expect(err.message).toContain('unauthorized')
                expect(err.message).toContain('does not have permission')
            })
        })

        it('resolves with true if session token provides privilege to stream', async () => {
            const res = await streamFetcher.checkPermission(streamId, await client.getAddress(), StreamPermission.SUBSCRIBE)
            expect(res).toEqual(true)
        })

        it('resolves with true if stream is publicly readable and read permission is requested', async () => {
            const stream = await client.getStream(streamId)
            const wallet = Wallet.createRandom()
            await stream.grantPublicPermission(StreamPermission.SUBSCRIBE)
            await streamFetcher.checkPermission(streamId, await wallet.getAddress(), StreamPermission.SUBSCRIBE).then((response: any) => {
                return assert.deepEqual(response, true)
            })
        })

    })

    describe('fetch', () => {
        it('returns Promise', async () => {
            const promise = streamFetcher.fetch(streamId)
            assert(promise instanceof Promise)
            await promise
        })

        it('rejects with NOT_FOUND if stream does not exist', async () => {
            await streamFetcher.fetch('nonExistingStreamId').catch((err: any) => {
                assert.equal(err.errorCode, 'NOT_FOUND')
            })
        })

        it('resolves with stream if session token provides privilege to stream', async () => {
            const stream = await streamFetcher.fetch(streamId)
            expect(stream.streamId).toEqual(streamId)
            expect(stream.partitions).toEqual(1)
        })

    })
})
